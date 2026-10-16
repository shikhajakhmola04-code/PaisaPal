import Database from "better-sqlite3";
import fs from "node:fs";

const db = new Database("paisapal.db");
db.pragma("foreign_keys = ON");
db.exec(fs.readFileSync("./schema.sql", "utf8"));

const categories = ["Food", "Travel", "Rent", "Shopping", "Bills", "Entertainment", "Other"];
const insertCategory = db.prepare("INSERT OR IGNORE INTO categories(name) VALUES (?)");
categories.forEach(c => insertCategory.run(c));

const insertUser = db.prepare("INSERT OR IGNORE INTO users(user_id,name,monthly_income) VALUES (?,?,?)");
[
  [1, "Riya", 25000],
  [2, "Aman", 30000],
  [3, "Rahul", 22000]
].forEach(u => insertUser.run(...u));

const categoryIds = Object.fromEntries(
  db.prepare("SELECT category_id,name FROM categories").all().map(c => [c.name, c.category_id])
);
const insertTxn = db.prepare(`
  INSERT INTO transactions(user_id,amount,type,category_id,note,txn_date)
  VALUES (?,?,?,?,?,?)
`);
const today = new Date();
const dateFor = daysAgo => {
  const d = new Date(today);
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0,10);
};
const samples = [
  ["Food", 180, "Lunch"], ["Travel", 70, "Auto fare"], ["Shopping", 450, "Clothes"],
  ["Bills", 300, "Mobile recharge"], ["Entertainment", 250, "Movie"], ["Food", 120, "Breakfast"],
  ["Rent", 7000, "Room rent"], ["Food", 320, "Groceries"], ["Travel", 140, "Cab"],
  ["Other", 200, "Stationery"], ["Food", 90, "Tea and snacks"], ["Shopping", 650, "Shoes"],
  ["Bills", 500, "Electricity"], ["Entertainment", 180, "Games"], ["Food", 240, "Dinner"],
  ["Travel", 60, "Bus"], ["Food", 400, "Restaurant"], ["Other", 150, "Personal expense"],
  ["Shopping", 300, "Household item"], ["Bills", 250, "Internet bill"]
];
const count = db.prepare("SELECT COUNT(*) AS n FROM transactions").get().n;
if (count === 0) {
  for (let i = 0; i < 60; i++) {
    const userId = (i % 3) + 1;
    const s = samples[i % samples.length];
    insertTxn.run(userId, s[1] + ((i % 4) * 10), "EXPENSE", categoryIds[s[0]], s[2], dateFor(i % 59));
  }
  for (const userId of [1,2,3]) {
    insertTxn.run(userId, userId === 2 ? 30000 : userId === 1 ? 25000 : 22000, "INCOME",
      categoryIds["Other"], "Monthly salary", dateFor(10));
  }
}
const insertBudget = db.prepare(`
  INSERT OR IGNORE INTO budgets(user_id,category_id,month,limit_amount) VALUES (?,?,?,?)
`);
const month = today.toISOString().slice(0,7);
for (const userId of [1,2,3]) {
  insertBudget.run(userId, categoryIds["Food"], month, 4000);
  insertBudget.run(userId, categoryIds["Travel"], month, 2000);
  insertBudget.run(userId, categoryIds["Shopping"], month, 3000);
  insertBudget.run(userId, categoryIds["Entertainment"], month, 1500);
}
console.log("Database ready: users, categories, 60+ transactions, and monthly budgets seeded.");
db.close();
