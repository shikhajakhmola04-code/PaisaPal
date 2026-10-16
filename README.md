# PaisaPal — Personal Expense & Budget Coach

**Task:** T3  
**Agent name:** PaisaPal  
**Team name:** Add your team name here

PaisaPal is a terminal-based AI agent that records income and expenses, reads real records from SQLite, summarizes monthly spending, manages budgets, and warns when a budget reaches 80% or goes over 100%.

## Requirements
- Node.js 18+
- OpenAI API key

## Setup
1. Extract this project folder.
2. Open a terminal in this folder.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Copy `.env.example` to `.env` and add your API key:
   ```env
   OPENAI_API_KEY=your_real_key
   OPENAI_MODEL=gpt-4o-mini
   ```
5. Create and seed the database:
   ```bash
   npm run seed
   ```
6. Start PaisaPal:
   ```bash
   npm start
   ```

## Users
- `user_id=1`: Riya
- `user_id=2`: Aman
- `user_id=3`: Rahul

## Tools implemented
- `add_transaction`
- `list_transactions`
- `get_spending_summary`
- `set_budget`
- `check_budget_status`
- `delete_transaction`

All tools read/write the SQLite database. Amounts must be positive, categories must be valid, and delete requests require confirmation.

## Database / ER diagram
```text
users (1) -------- (many) transactions (many) -------- (1) categories
  |                                                       |
  |                                                       |
  +---------------- (many) budgets (many) ----------------+
```

Tables: `users`, `categories`, `transactions`, `budgets`. The schema is in `schema.sql`; sample data is inserted by `seed.js`.

## Test
See `test_prompts.md`. API use requires internet and a valid OpenAI API key.
