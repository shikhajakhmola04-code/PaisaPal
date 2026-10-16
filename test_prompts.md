# PaisaPal — Mandatory Test Prompts

**Task:** T3 — Personal Expense & Budget Coach  
**Agent:** PaisaPal

> Important: Run each prompt in the live terminal and replace the “Actual reply” with the exact output you receive. Replies and totals vary with current date and seeded data.

## 1. Add expenses using natural language
**Prompt:** Spent 250 on pizza yesterday and 120 on an auto today.

**Expected check:** Agent should record each expense with the right amount, category and date. If it cannot reliably split the two expenses, enter them as two separate prompts:
- `Spent 250 on Food yesterday for pizza`
- `Spent 120 on Travel today for auto`

**Actual reply:** Paste terminal output here.

## 2. Food spending this month
**Prompt:** How much did I spend on food this month?

**Expected check:** Uses `get_spending_summary` and reports Food total from the database.

**Actual reply:** Paste terminal output here.

## 3. Set shopping budget
**Prompt:** Set my shopping budget to 3000 for this month.

**Expected check:** Saves/updates Shopping budget to ₹3000 for the current month.

**Actual reply:** Paste terminal output here.

## 4. Check budget status
**Prompt:** Am I over budget anywhere?

**Expected check:** Uses `check_budget_status` and reports OK / WARNING / OVER BUDGET from actual database values.

**Actual reply:** Paste terminal output here.

## 5. Compare months and give saving tips
**Prompt:** Compare my spending this month with last month and give me 3 saving tips.

**Expected check:** Uses database summaries for both months and bases tips on the returned totals. If necessary, ask the agent separately: `Summarize my spending for YYYY-MM` for each month.

**Actual reply:** Paste terminal output here.

## Business rule violation test
**Prompt:** Add an expense of -200 for Food.

**Expected check:** Must reject the negative amount and not save a transaction.

**Actual reply:** Paste terminal output here.

## Delete confirmation test
**Prompt:** Delete transaction 1.

**Expected check:** Agent must ask for explicit confirmation before deletion. Only after replying `Yes, confirm deletion of transaction 1` should it delete.
