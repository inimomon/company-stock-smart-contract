import { Canister, query, text, update, Void, 
    Record, StableBTreeMap, Vec, 
    Result, nat64, ic, Opt, int8, int16, int64, Principal,
} from 'azle';
import { v4 as uuidv4 } from 'uuid';

type User = {
    id: int64,
    uname: text,
    password: text,
    status: text,
    money: int64,
    property: Property | null,
};

type Property = {
    pname?: text,
    value?: int64,
    percentage?: int64,
    shareHolders?: {
      name: text,
      percentages: int64,
    }[]
};

const UserDB = StableBTreeMap<int64, User>(0);

// Helper function to generate a random number for id
function randomNumber(): int64 {
  return BigInt(Math.floor(Math.random() * 9000) + 1000);
}

// Helper function to generate the deduction of money for investment
function newMoneyGenerator(user: any, company: any, percentage: bigint) {
  const cost = BigInt(company.Some.property.value) * BigInt(percentage) / BigInt(100);
  const newMoney = user.Some.money - cost;
  return newMoney;
}


export default Canister({
  createUser: update([text, text, text, int64], text, (name, password, status, money) => {
    const id = randomNumber();

    UserDB.insert(id, {
      id: id,
      uname: name,
      password: password,
      status: status,
      money: money,
      property: null,
    });

    // User gets to choose their status as 'Manager' or 'User'
    if(status == "Manager") {
      return `Create your first property by using the command 'createProperty', you will need your id: ${id}`;
    }

      return `Your account is created successfully! Please keep this id for further interactions: ${id}`;
  }),

  checkBalance: query([int64], text, (id) => {
    const user = UserDB.get(id);

    if('None' in user) {
      return 'Your id is incorrect!';
    } else {
      const money = user.Some.money;
      return `your current balance is ${money}`;
    }
  }),

  createProperty: update([int64, text, int64], text, (id, propertyName, value) => {
    const user = UserDB.get(id);

    if('None' in user) {
      return 'Your id is wrong!';
    }

    if(user.Some.status == 'User') {
      return 'A user cannot make a property! Make an account with a Manager status.';
    }

    UserDB.insert(id, {
      ...user.Some,
      property: {
        pname: propertyName,
        value: value,
        percentage: BigInt(100),
      }
    });

    return `Your property is created successfully! shareholders will refer to your id to invest: ${id}`;
  }),

  investProperty: update([int64, int64, int64], text, (userID, companyID, percentage) => {
    const userResult = UserDB.get(userID);
    const companyResult = UserDB.get(companyID);
  
    if ('None' in userResult) {
      return 'Your account ID is wrong!';
    }
  
    if ('None' in companyResult) {
      return 'The property you were looking for is not listed here!';
    }
  
    if (!userResult.Some || !companyResult.Some) {
      return 'An unexpected error occurred.';
    }
  
    if (!companyResult.Some.property) {
      return 'The property details are missing!';
    }

    if (companyResult.Some.property.percentage === undefined) {
      return 'Percentage of property is not defined!';
    }
    
    const name: string = userResult.Some.uname;
    let newMoney: int64 = newMoneyGenerator(userResult, companyResult, BigInt(percentage));
  
    let newPercentage: int64 = companyResult.Some.property.percentage - BigInt(percentage);
  
    let currentShareHolders: { name: string; percentages: bigint }[] = companyResult.Some.property.shareHolders || [];
    const newShareHolder = {
      name: name,
      percentages: BigInt(percentage),
    };
  
    currentShareHolders.push(newShareHolder);
  
    UserDB.insert(companyID, {
      ...companyResult.Some,
      property: {
        ...companyResult.Some.property,
        percentage: newPercentage,
        shareHolders: currentShareHolders
      }
    });
  
    UserDB.insert(userID, {
      ...userResult.Some,
      money: newMoney,
    });
  
    return 'Investment updated successfully!';
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