import "dotenv/config";
import OpenAI from "openai";
import Database from "better-sqlite3";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

// Check API key
if (!process.env.GROQ_API_KEY) {
  console.error("GROQ_API_KEY missing. Add it to your .env file.");
  process.exit(1);
}

// Groq API setup
const openai = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1"
});

const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

// Database setup
const db = new Database("paisapal.db");
db.pragma("foreign_keys = ON");

const categories = db.prepare(
  "SELECT category_id, name FROM categories"
).all();

function categoryId(name) {
  if (!name) return null;

  const found = categories.find(
    c => c.name.toLowerCase() === String(name).toLowerCase()
  );

  return found?.category_id ?? null;
}

function today() {
  // Use local date, not UTC date
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthNow() {
  return today().slice(0, 7);
}

function parseDate(value) {
  if (!value || /today/i.test(value)) return today();

  if (/yesterday/i.test(value)) {
    const d = new Date();
    d.setDate(d.getDate() - 1);

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  if (/last month/i.test(value)) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);

    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  }

  if (/^\d{4}-\d{2}$/.test(value)) {
    return `${value}-01`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) return today();

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Tool definitions
const tools = [
  {
    type: "function",
    function: {
      name: "add_transaction",
      description:
        "Save one income or expense. Amount must be greater than zero. Never save a zero or negative amount. Never guess a missing amount or category.",
      parameters: {
        type: "object",
        properties: {
          user_id: {
            type: "integer",
            description: "1=Riya, 2=Aman, 3=Rahul; default 1"
          },
          amount: { type: "number" },
          type: {
            type: "string",
            enum: ["EXPENSE", "INCOME"]
          },
          category: {
            type: "string",
            enum: [
              "Food", "Travel", "Rent", "Shopping",
              "Bills", "Entertainment", "Other"
            ]
          },
          note: { type: "string" },
          date: {
            type: "string",
            description: "today, yesterday, or YYYY-MM-DD"
          }
        },
        required: ["amount", "type", "category"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_transactions",
      description: "List saved transactions with optional filters.",
      parameters: {
        type: "object",
        properties: {
          user_id: { type: "integer" },
          type: { type: "string", enum: ["EXPENSE", "INCOME"] },
          category: { type: "string" },
          start_date: { type: "string" },
          end_date: { type: "string" }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_spending_summary",
      description: "Get monthly expense totals by category and percentages.",
      parameters: {
        type: "object",
        properties: {
          user_id: { type: "integer" },
          month: { type: "string", description: "YYYY-MM" }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "set_budget",
      description: "Create or update a monthly category budget.",
      parameters: {
        type: "object",
        properties: {
          user_id: { type: "integer" },
          category: { type: "string" },
          limit_amount: { type: "number" },
          month: { type: "string" }
        },
        required: ["category", "limit_amount"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "check_budget_status",
      description: "Compare spending with each category budget.",
      parameters: {
        type: "object",
        properties: {
          user_id: { type: "integer" },
          month: { type: "string" }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "delete_transaction",
      description:
        "Delete a transaction only after the user explicitly confirms. First call with confirmed=false to request confirmation.",
      parameters: {
        type: "object",
        properties: {
          user_id: { type: "integer" },
          txn_id: { type: "integer" },
          confirmed: { type: "boolean" }
        },
        required: ["txn_id", "confirmed"],
        additionalProperties: false
      }
    }
  }
];

// Execute database tools
function runTool(name, a) {
  const userId = Number(a.user_id ?? 1);

  if (![1, 2, 3].includes(userId)) {
    return {
      error: "Unknown user. Use 1 (Riya), 2 (Aman), or 3 (Rahul)."
    };
  }

  // Add transaction
  if (name === "add_transaction") {
    const amount = Number(a.amount);
    const type = String(a.type || "").toUpperCase();
    const catId = categoryId(a.category);

    // IMPORTANT: reject invalid amounts before database insertion
    if (!Number.isFinite(amount) || amount <= 0) {
      return {
        error: "Amount must be greater than ₹0. No transaction was recorded."
      };
    }

    if (!["EXPENSE", "INCOME"].includes(type)) {
      return { error: "Choose EXPENSE or INCOME." };
    }

    if (!catId) {
      return {
        error: "Invalid category. Choose Food, Travel, Rent, Shopping, Bills, Entertainment, or Other."
      };
    }

    const date = parseDate(a.date);

    const ins = db.prepare(`
      INSERT INTO transactions
      (user_id, amount, type, category_id, note, txn_date)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      amount,
      type,
      catId,
      String(a.note || ""),
      date
    );

    let budgetWarning = "";
    const month = date.slice(0, 7);

    if (type === "EXPENSE") {
      const budget = db.prepare(`
        SELECT limit_amount
        FROM budgets
        WHERE user_id = ? AND category_id = ? AND month = ?
      `).get(userId, catId, month);

      if (budget) {
        const spent = db.prepare(`
          SELECT COALESCE(SUM(amount), 0) AS total
          FROM transactions
          WHERE user_id = ?
            AND category_id = ?
            AND type = 'EXPENSE'
            AND substr(txn_date, 1, 7) = ?
        `).get(userId, catId, month).total;

        if (spent > budget.limit_amount) {
          budgetWarning =
            ` ALERT: Budget exceeded (₹${spent.toFixed(2)} / ₹${budget.limit_amount.toFixed(2)}).`;
        } else if (spent >= budget.limit_amount * 0.8) {
          budgetWarning =
            ` Warning: At least 80% of the budget is used (₹${spent.toFixed(2)} / ₹${budget.limit_amount.toFixed(2)}).`;
        }
      }
    }

    return {
      message: `Saved transaction #${ins.lastInsertRowid}: ${type}, ₹${amount}, ${a.category}, ${date}.${budgetWarning}`
    };
  }

  // List transactions
  if (name === "list_transactions") {
    const clauses = ["t.user_id = ?"];
    const params = [userId];

    if (a.type) {
      clauses.push("t.type = ?");
      params.push(String(a.type).toUpperCase());
    }

    if (a.category) {
      const cid = categoryId(a.category);
      if (!cid) return { error: "Unknown category." };

      clauses.push("t.category_id = ?");
      params.push(cid);
    }

    if (a.start_date) {
      clauses.push("t.txn_date >= ?");
      params.push(parseDate(a.start_date));
    }

    if (a.end_date) {
      clauses.push("t.txn_date <= ?");
      params.push(parseDate(a.end_date));
    }

    const rows = db.prepare(`
      SELECT t.txn_id, t.amount, t.type, c.name AS category,
             t.note, t.txn_date
      FROM transactions t
      JOIN categories c ON c.category_id = t.category_id
      WHERE ${clauses.join(" AND ")}
      ORDER BY t.txn_date DESC
      LIMIT 30
    `).all(...params);

    return { transactions: rows, count: rows.length };
  }

  // Monthly spending summary
  if (name === "get_spending_summary") {
    const month = String(a.month || monthNow()).slice(0, 7);

    const rows = db.prepare(`
      SELECT c.name AS category, SUM(t.amount) AS total
      FROM transactions t
      JOIN categories c ON c.category_id = t.category_id
      WHERE t.user_id = ?
        AND t.type = 'EXPENSE'
        AND substr(t.txn_date, 1, 7) = ?
      GROUP BY c.category_id
      ORDER BY total DESC
    `).all(userId, month);

    const total = rows.reduce((sum, r) => sum + r.total, 0);

    return {
      user_id: userId,
      month,
      total_spending: Number(total.toFixed(2)),
      categories: rows.map(r => ({
        category: r.category,
        total: Number(r.total.toFixed(2)),
        percent_of_total: total
          ? Number((r.total / total * 100).toFixed(1))
          : 0
      }))
    };
  }

  // Create or update budget
  if (name === "set_budget") {
    const cid = categoryId(a.category);
    const amount = Number(a.limit_amount);
    const month = String(a.month || monthNow()).slice(0, 7);

    if (!cid) return { error: "Choose a valid category." };

    if (!Number.isFinite(amount) || amount <= 0) {
      return { error: "Budget must be greater than ₹0." };
    }

    db.prepare(`
      INSERT INTO budgets (user_id, category_id, month, limit_amount)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, category_id, month)
      DO UPDATE SET limit_amount = excluded.limit_amount
    `).run(userId, cid, month, amount);

    return {
      message: `Budget set: ${a.category}, ₹${amount} for ${month}.`
    };
  }

  // Check budget status
  if (name === "check_budget_status") {
    const month = String(a.month || monthNow()).slice(0, 7);

    const rows = db.prepare(`
      SELECT c.name AS category,
             b.limit_amount,
             COALESCE(SUM(
               CASE
                 WHEN t.type = 'EXPENSE'
                  AND substr(t.txn_date, 1, 7) = b.month
                 THEN t.amount
                 ELSE 0
               END
             ), 0) AS spent
      FROM budgets b
      JOIN categories c ON c.category_id = b.category_id
      LEFT JOIN transactions t
        ON t.user_id = b.user_id
       AND t.category_id = b.category_id
      WHERE b.user_id = ? AND b.month = ?
      GROUP BY b.budget_id
      ORDER BY c.name
    `).all(userId, month);

    return {
      month,
      budgets: rows.map(r => ({
        category: r.category,
        limit_amount: r.limit_amount,
        spent: r.spent,
        remaining: Number((r.limit_amount - r.spent).toFixed(2)),
        percent_used: Number((r.spent / r.limit_amount * 100).toFixed(1)),
        status: r.spent > r.limit_amount
          ? "OVER BUDGET"
          : r.spent >= r.limit_amount * 0.8
            ? "WARNING"
            : "OK"
      }))
    };
  }

  // Delete transaction
  if (name === "delete_transaction") {
    if (a.confirmed !== true) {
      return {
        needs_confirmation: true,
        message: `Ask the user to confirm deletion of transaction #${a.txn_id}. Do not delete it yet.`
      };
    }

    const result = db.prepare(`
      DELETE FROM transactions
      WHERE txn_id = ? AND user_id = ?
    `).run(Number(a.txn_id), userId);

    return result.changes
      ? { message: `Transaction #${a.txn_id} deleted.` }
      : { error: "Transaction not found for this user." };
  }

  return { error: "Unknown tool." };
}

// System instructions for the AI
const systemPrompt = `
You are PaisaPal, a friendly personal expense and budget coach.

Introduce yourself as PaisaPal.
Use database tools for all financial records. Never invent totals.
Default user_id is 1 (Riya), unless the user selects Aman (2) or Rahul (3).

Categories: Food, Travel, Rent, Shopping, Bills, Entertainment, Other.

When adding a transaction:
- If the amount or category is missing, ask the user a clarifying question.
- Never guess a missing amount or category.
- Amount must be greater than ₹0.
- If the user gives a zero or negative amount, reject it immediately.
- Do not interpret negative amounts as refunds automatically.
- Do not call add_transaction for zero or negative amounts.
- Tell the user no transaction was recorded and request a positive amount.
- Do not ask whether a negative amount was a refund.

Convert today and yesterday to real dates through the tool.
Warn when spending reaches 80% of a budget.
Clearly alert when spending exceeds 100% of a budget.

Before deleting a transaction:
- Ask the user for explicit confirmation first.
- Never delete before the user confirms.

Give simple insights and practical saving tips based on actual database results.
`;

// Start CLI
const rl = readline.createInterface({ input, output });
const messages = [{ role: "system", content: systemPrompt }];

console.log("\nPaisaPal: Hi! I'm PaisaPal, your expense and budget coach.");
console.log("Examples: 'Spent 250 on Food yesterday', 'How much did I spend this month?', 'Set Shopping budget to 3000'.");
console.log("Use user 1=Riya, 2=Aman, 3=Rahul. Type 'exit' to quit.\n");

try {
  while (true) {
    const userText = (await rl.question("You: ")).trim();

    if (!userText) continue;
    if (["exit", "quit"].includes(userText.toLowerCase())) break;

    messages.push({ role: "user", content: userText });

    try {
      // Local guard: reject explicitly negative/zero transaction amounts
      // before the AI can reinterpret them.
      
      // Reject zero or negative transaction amounts
      const looksLikeTransaction =
        /\b(spent|spend|expense|paid|bought|income|earned|received)\b/i.test(userText);

      
      
      
      const hasNonPositiveAmount = userText
        .split(/\s+/)
        .some((word) => /^-\d/.test(word))
        || /\b(?:spent|spend|paid|bought|income|earned|received)\s+(?:₹\s*)?0+(?:\.0+)?\b/i.test(userText);


      if (looksLikeTransaction && hasNonPositiveAmount) {
        console.log("PaisaPal: The amount must be greater than ₹0. No transaction was recorded. Please enter a valid positive amount.\n");
        messages.push({
          role: "assistant",
          content: "The amount must be greater than ₹0. No transaction was recorded. Please enter a valid positive amount."
        });
        continue;
      }

      let response = await openai.chat.completions.create({
        model,
        messages,
        tools,
        tool_choice: "auto",
        temperature: 0.2
      });

      let msg = response.choices[0].message;
      messages.push(msg);

      let turns = 0;

      while (msg.tool_calls && turns < 6) {
        turns++;

        for (const call of msg.tool_calls) {
          let args = {};

          try {
            args = JSON.parse(call.function.arguments || "{}");
          } catch {
            messages.push({
              role: "tool",
              tool_call_id: call.id,
              content: JSON.stringify({ error: "Invalid tool arguments." })
            });
            continue;
          }

          const result = runTool(call.function.name, args);

          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify(result)
          });
        }

        response = await openai.chat.completions.create({
          model,
          messages,
          tools,
          tool_choice: "auto",
          temperature: 0.2
        });

        msg = response.choices[0].message;
        messages.push(msg);
      }

      console.log(`PaisaPal: ${msg.content || "Done."}\n`);
    } catch (err) {
      console.error("PaisaPal error:", err?.message || err);
      console.log("Please check your API key, internet connection, and try again.\n");
    }
  }
} finally {
  rl.close();
  db.close();
}