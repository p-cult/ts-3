# Admin guide — Param Task Board

A plain-language guide for people who run the Task Board day to day.  
No coding required.

**Live board:** https://p-cult.github.io/task/

---

## What this system is

The Task Board is the shared place where Param work is listed, updated, reviewed, and closed.

Behind the scenes it stays in sync with your Google Sheets. You normally work in the **website**, not by typing into every sheet cell by hand.

---

## Who can do what

| Role | Typical use |
|------|-------------|
| **Team member** | See own work, update progress, add file links, submit for review |
| **Moderator / lead** | Review files, approve finished work, help across people |
| **Admin** | Everything above, plus bulk Inject, project list updates, reassign, delete |

Your login on the live site comes from the Master spreadsheet **users** list (username + password there).  
Offline demo passwords from training machines are **not** the live passwords unless that same person exists on the Master users list.

---

## Getting in

1. Open https://p-cult.github.io/task/  
2. Click **Log in**  
3. Enter your username and password  
4. Click **Sign in**

If login fails: check Caps Lock, then confirm your row still exists on the Master **users** sheet and the password cell matches what you typed.

When you are finished: **Log out**.

---

## The main tabs

| Tab | What it’s for |
|-----|----------------|
| **Board** | Active work you can create and edit |
| **Logged** | Diary-style / routine notes that are not the main board |
| **Needs attention** | Items waiting for approval, file review, or rework |
| **Completed** | Finished work |
| **Activity** | Searchable history / export |
| **Inject** | Admin-only: paste a batch of tasks into the system |

At the top you may also see **Overview** (counts) and, for admins, **Update projects**.

---

## Projects (very important for admins)

Projects are the “buckets” people pick when creating work (for example *Social Media* or *Production Grant 26*).

### Where the list lives

On the Master Google Sheet, tab **`admin`**.

| What you change | Effect |
|-----------------|--------|
| Turn a project **off** | Set column **Active** to `No` (plain text, not a stuck “always yes” formula). It disappears from the website dropdown. The row can stay on the sheet. |
| Turn a project **on** | Set **Active** to `Yes` |
| Friendly name in the dropdown | Edit column **F — Pseudo Name** (this is what people see when picking a project) |
| Reorder the list | Move whole rows up/down on the `admin` tab |

### After you change the sheet

1. Save the Google Sheet  
2. On the website, signed in as admin, click **Update projects**  
3. Open **+ Add task** and check the project list  

Within a short time the list also refreshes by itself. The button is for “I need it right now.”

### Please don’t casually edit

- The long **Project code** formula column (built from base code + edition)  
- Other blue formula cells that rebuild themselves  

Wrong project codes break how new Task IDs are created.

---

## Creating a task (Board)

1. Go to **Board**  
2. Click **+ Add task**  
3. Choose a **Project** (required)  
4. Fill **Name** (and description / notes if useful)  
5. Set times if needed  
6. Admins can set **Kind** (Normal / Pseudo / Routine) and assignee  
7. Click **SUBMIT**

The task appears on the board. The system assigns its official ID in the background — you don’t type that ID.

---

## Editing a task

1. Find the card → **EDIT**  
2. Change the fields you need  
3. **UPDATE** or **Cancel**

Admins can also:

- **Re-assign** to another person  
- **Delete** (removes from the board and clears matching sheet rows when the live bridge is working)  
- Change status (**Active**, **Pause**, **Blocked**, **Done**, etc.)

---

## Links and file review

People can attach up to **four** review links on a task (**Add link**). Each link needs a clear name and a real working URL.

Reviewers use **Needs attention** → focus on **Needs file review** or open **Review** on the card, then **Submit Feedback** with star ratings:

| Stars | Meaning (simple) |
|-------|------------------|
| **3★** | Approved |
| **2★** | Acceptable with a tag; may not need another file round later |
| **1★** | Needs rework (comment required) |

---

## Approving finished work

When someone marks main work **Done**, it may show **Waiting for approval**.

Admins / leads:

1. Open **Needs attention**  
2. Focus **Waiting approval** if helpful  
3. Click **Approve task** on the card  
   — or select several and use **Approve tasks**

Approved work stays **Done** and moves into the completed picture correctly.

---

## Inject (bulk paste) — admins

Use **Inject** when you have a list from chat, a spreadsheet export, or similar.

Rough flow shown on screen:

1. Paste into **Bulk text**  
2. Click **Process**  
3. **Filter** and **Select** the rows you want  
4. Set **Project** / **Kind** / duplicate action if needed → **Apply to selected**  
5. Click **Inject into system**

Tips:

- Unmapped projects must be chosen from the Master list before inject  
- **Refresh from master** (on Inject) reloads projects/people/depot if something looks stale  
- Prefer fixing the Master project list first, then **Update projects**, then inject  

---

## Everyday admin checklist

**Morning / as needed**

- [ ] Board loads and people can log in  
- [ ] Project list matches what you want (Active + Pseudo Name)  
- [ ] **Needs attention** is cleared or assigned  

**When projects change on the Master sheet**

- [ ] Edit `admin` carefully  
- [ ] Click **Update projects**  
- [ ] Spot-check **+ Add task** dropdown  

**When something looks wrong**

- [ ] Hard-refresh the website  
- [ ] Confirm you used a Master users password  
- [ ] Ask a developer to check https://param-task-middleware.onrender.com/api/health  

---

## Things that cause pain (avoid)

1. **Editing Task IDs** in Google Sheets by hand  
2. **Two systems writing** the same sheets at once (old app + this board)  
3. **Inventing projects** only on a user sheet instead of the Master `admin` tab  
4. Leaving **Active** stuck as an auto-`yes` formula so you cannot turn projects off  
5. Expecting offline demo logins to work on the live website  

---

## Quick glossary

| Word | Meaning |
|------|---------|
| **Board** | Main list of open work |
| **Project** | Bucket for work (from Master `admin`) |
| **Pseudo Name** | Friendly project label people pick in the dropdown |
| **Inject** | Admin bulk create from pasted text |
| **Needs attention** | Queue for approvals and file reviews |
| **Master sheet** | Central Google workbook (users, projects, depot) |
| **Update projects** | Admin button: reload project list from Master now |

---

## Where to get help

| Question | Ask |
|----------|-----|
| Password / who can log in | Sheet admin (Master **users** tab) |
| Which projects should appear | Sheet admin (`admin` tab) + use **Update projects** |
| Website broken / error messages | Developer with access to GitHub `p-cult/ts-3` and Render |
| Training this guide again | Use the KT page version: `kt-site/admin-guide.html` |
