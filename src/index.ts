import { Canister, query, text, update,
    Record, StableBTreeMap, Vec, 
    nat, Principal, ic, Result, Err, Ok, Variant, Null
} from 'azle';
import { v4 as uuidv4 } from 'uuid';

const ShareHolder = Record({
  name: text,
  principal: Principal,
  userId: text,
  percentages: nat
})
const PropertyDetails = Record({
  pname: text,
  value: nat,
  percentage: nat,
  shareHolders: Vec(ShareHolder)
});
const Property = Variant({
  Property: PropertyDetails,
  Empty: Null
})
const User = Record({
    id: text,
    principal: Principal,
    uname: text,
    status: text,
    money: nat,
    property: Property,
});

type User = typeof  User;

const UserDB = StableBTreeMap(text, User, 0);


// Helper function to generate the deduction of money for investment amount required
function newMoneyGenerator(property: User, percentage: bigint) : nat{
  if (property.property.Property){
    const cost = BigInt(property.property.Property.value) * BigInt(percentage) / BigInt(100);
    return cost;
  }
  return BigInt(0);
}


export default Canister({
  createUser: update([text, text, nat], Result(text, text), (name, status, money) => {
    const roles = ["Manager", "User"]
    if (name.trim().length == 0){
      return Err("Name cannot be empty")
    }
    if (!roles.includes(status)){
      return Err("Status can only be either Manager or User")
    }
    const id = uuidv4();
    const user: User = {
      id,
      principal: ic.caller(),
      uname: name,
      status,
      money,
      property:{ Empty: null}
    }
    UserDB.insert(id, user);

    // User gets to choose their status as 'Manager' or 'User'
    if(status == "Manager") {
      return Ok(`Create your first property by using the function 'createProperty', you will need your id: ${id}`);
    }

      return Ok(`Your account is created successfully! Please keep this id for further interactions: ${id}`);
  }),

  checkBalance: query([text], text, (id) => {
    const user = UserDB.get(id);

    if('None' in user) {
      return 'Your id is incorrect!';
    } else {
      const money = user.Some.money;
      return `your current balance is ${money}`;
    }
  }),
  checkUser: query([text], Result(User,text), (id) => {
    const user = UserDB.get(id);

    if('None' in user) {
      return Err('Your id is incorrect!');
    } else {
      return Ok(user.Some);
    }
  }),

  createProperty: update([text, text, nat], Result(text,text), (id, propertyName, value) => {
    const userOpt = UserDB.get(id);

    if('None' in userOpt) {
      return Err('Your id is wrong!');
    }

    if(value == BigInt(0)){
      return Err("Value cannot be set to zero")
    }

    const user : User = userOpt.Some;

    if(user.status != 'Manager') {
      return Err('A user cannot make a property! Make an account with a Manager status.');
    }

    if (user.principal.toString() !== ic.caller().toString()){
      return Err("THe caller is not user's principal")
    }
    if (user.property.Property) {
      return Err('Cannot modify property!');
    }

    let updatedUser: User = {
      ...user,
      property: {Property: {
        pname: propertyName,
        value: value,
        percentage: BigInt(100),
        shareHolders: []
      }}
    }
    UserDB.insert(id, updatedUser);

    return Ok(`Your property is created successfully! shareholders will refer to your id to invest: ${id}`);
  }),

  investProperty: update([text, text, nat], Result(text,text), (userID, shareholderId, percentage) => {
    const userResult = UserDB.get(userID);
    const shareholderResult = UserDB.get(shareholderId);
    if ('None' in userResult) {
      return Err('Incorrect user ID is wrong!');
    }
    if ('None' in shareholderResult) {
      return Err('Incorrect shareholder ID is wrong!');
    }
    
    let user: User = userResult.Some;
    if (user.principal.toString() === shareholderResult.Some.principal.toString()){
      return Err("You cannot buy shares from your own property.")
    }
    if (user.property.Property) {
      if (shareholderResult.Some.principal.toString() !== ic.caller().toString()){
        return Err("Caller isn't the principal of the shareholder")
      }
      if (user.property.Property.percentage == BigInt(0)) {
        return Err('All the shares of the property have already been bought.');
      }
      if (user.property.Property.percentage < percentage) {
        return Err("Investment percentage can't be greater than the current available percentage!");
      }
      
      let cost: nat = newMoneyGenerator(user, BigInt(percentage));

      if(cost == BigInt(0)){
        return Err("Failed to calculate investment cost")
      }
      if(cost > shareholderResult.Some.money){
        return Err("Not enough funds to afford property")
      }
    
      let newPercentage: nat = user.property.Property.percentage - BigInt(percentage);
      let currentShareHolders: Vec<typeof ShareHolder> = user.property.Property.shareHolders || [];
      let isCallerShareHolder = currentShareHolders
                                .findIndex((shareHolder: typeof ShareHolder) => shareHolder.principal.toString() === ic.caller().toString());
      if (isCallerShareHolder == -1){
        const newShareHolder : typeof ShareHolder = {
          name: shareholderResult.Some.uname,
          userId: shareholderId,
          principal: ic.caller(),
          percentages: BigInt(percentage)
    
        };
      
        currentShareHolders.push(newShareHolder);
      }else{
        currentShareHolders[isCallerShareHolder]= {
          ...currentShareHolders[isCallerShareHolder],
          percentages: currentShareHolders[isCallerShareHolder].percentages + BigInt(percentage)
    
        };
      }
      //save updated money property of the shareholder
      UserDB.insert(shareholderId, {
        ...shareholderResult.Some,
        money: shareholderResult.Some.money - cost,
      });

      // save updated state of the property and the associated user
      UserDB.insert(userID, {
        ...userResult.Some,
        money: userResult.Some.money + cost,
        property: {Property: {
          ...user.property.Property,
          percentage: newPercentage,
          shareHolders: currentShareHolders
        }}
      });

      return Ok('Investment updated successfully!');
    }
    return Err('The property details are missing!');
  })
  
   
});

// a workaround to make uuid package work with Azle
globalThis.crypto = {
    // @ts-ignore
    getRandomValues: () => {
      let array = new Uint8Array(32);
  
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
  
      return array;
    },
  };