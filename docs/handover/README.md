# Client handover — Param Task Board (ts-3)

Package for transferring ownership of the live Task Board system to the client organization.

| Document | Audience | Purpose |
|----------|----------|---------|
| **[DELIVERY-PACKAGE.md](DELIVERY-PACKAGE.md)** | Client lead / IT | What you receive, URLs, accounts, checklist |
| **[ONE-BOX-DEPLOY.md](ONE-BOX-DEPLOY.md)** | IT / operators | Portable UI+API deploy (Docker or Node) with Sheets bridge intact |
| **[AI-HANDOFF.md](AI-HANDOFF.md)** | Developers + AI tools | Short architecture map so any AI/assistant can continue safely |
| **[CONTINUE-DEVELOPING.md](CONTINUE-DEVELOPING.md)** | Developers | How to run, change, test, and ship |
| **[ADMIN-GUIDE.md](ADMIN-GUIDE.md)** | Admins / operators | Plain-language how to use the board |
| **[kt-site/admin-guide.html](kt-site/admin-guide.html)** | KT website | Same admin guide as a self-contained page (embed or open as-is) |

## Live production (as delivered)

| Piece | URL / location |
|-------|----------------|
| **Task Board (users + admins)** | https://p-cult.github.io/task/ |
| **API (middleware)** | https://param-task-middleware.onrender.com |
| **Code (middleware + source UI)** | https://github.com/p-cult/ts-3 |
| **Pages UI repo** | https://github.com/p-cult/task |
| **Data** | Live Google Master + user sheets (via Apps Script bridge) |

## Suggested KT site structure

1. Welcome / what this system is  
2. **Admin guide** ← embed `kt-site/admin-guide.html` or link `ADMIN-GUIDE.md`  
3. Roles (User vs Moderator vs Admin)  
4. Projects on the Master sheet (Active / Pseudo Name)  
5. Developer handoff ← `CONTINUE-DEVELOPING.md`  
6. Support / who owns what  

## Ownership reminder

- Develop and push only against **`p-cult/ts-3`** and **`p-cult/task`**.  
- Do not treat personal forks as the source of truth.  
- Invite collaborators on those two repos by their exact GitHub login.
