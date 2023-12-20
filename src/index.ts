import { Canister, query, text, update, Result, StableBTreeMap, int64 } from 'azle';

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
  percentage?: bigint,
  shareHolders?: {
    name: text,
    percentages: bigint,
  }[]
};

const UserDB = StableBTreeMap<int64, User>(0);

// Helper function to generate a random number for id
function randomNumber(): int64 {
  return BigInt(Math.floor(Math.random() * 9000) + 1000);
}

// Helper function to generate the deduction of money for investment
function newMoneyGenerator(user: User, company: User, percentage: bigint): int64 {
  const cost = (company?.Some?.property?.value || BigInt(0)) * (percentage || BigInt(0)) / BigInt(100);
  const newMoney = user.Some.money - cost;
  return newMoney;
}

export default Canister({
  createUser: update([text, text, text, int64], Result(text, 'An unexpected error occurred.'), (name, password, status, money) => {
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
    if (status === 'Manager') {
      return `Create your first property by using the command 'createProperty', you will need your id: ${id}`;
    }

    return `Your account is created successfully! Please keep this id for further interactions: ${id}`;
  }),

  checkBalance: query([int64], Result(text, 'Your id is incorrect!'), (id) => {
    const user = UserDB.get(id);

    if ('None' in user) {
      return Result.Err('Your id is incorrect!');
    } else {
      const money = user.Some.money;
      return Result.Ok(`Your current balance is ${money}`);
    }
  }),

  createProperty: update([int64, text, int64], Result(text, 'Your id is wrong!'), (id, propertyName, value) => {
    const user = UserDB.get(id);

    if ('None' in user) {
      return Result.Err('Your id is wrong!');
    }

    if (user.Some.status === 'User') {
      return Result.Err('A user cannot make a property! Make an account with a Manager status.');
    }

    UserDB.insert(id, {
      ...user.Some,
      property: {
        pname: propertyName,
        value: value,
        percentage: BigInt(100),
      },
    });

    return Result.Ok(`Your property is created successfully! Shareholders will refer to your id to invest: ${id}`);
  }),

  investProperty: update([int64, int64, int64], Result(text, 'An unexpected error occurred.'), (userId, companyId, percentage) => {
    const userResult = UserDB.get(userId);
    const companyResult = UserDB.get(companyId);

    if ('None' in userResult || 'None' in companyResult) {
      return Result.Err('Your account ID or property ID is wrong!');
    }

    const user = userResult.Some;
    const company = companyResult.Some;

    if (!user || !company || !company.property || company.property.percentage === undefined) {
      return Result.Err('An unexpected error occurred.');
    }

    if (percentage <= 0 || percentage > company.property.percentage) {
      return Result.Err('Invalid percentage to invest!');
    }

    let newMoney = newMoneyGenerator(user, company, BigInt(percentage));

    if (newMoney < 0) {
      return Result.Err('Not enough money to invest!');
    }

    const name: string = user.uname;

    let newPercentage: bigint = company.property.percentage - BigInt(percentage);

    let currentShareHolders: { name: string; percentages: bigint }[] = company.property.shareHolders || [];
    const newShareHolder = {
      name: name,
      percentages: BigInt(percentage),
    };

    currentShareHolders.push(newShareHolder);

    UserDB.insert(companyId, {
      ...company,
      property: {
        ...company.property,
        percentage: newPercentage,
        shareHolders: currentShareHolders,
      },
    });

    UserDB.insert(userId, {
      ...user,
      money: newMoney,
    });

    return Result.Ok('Investment updated successfully!');
  }),
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
