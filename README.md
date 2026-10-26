# AccessDeck

A CS408 subscription access and usage management project using React, Express,
TypeScript, and PostgreSQL.

## Prerequisites

- Linux and Bash. On Windows, use Ubuntu in WSL.
- Node.js **24** and npm are recommended (`.nvmrc`); Node.js **22.13+ on 22.x** also works.
- PostgreSQL **14+** server tools, including `initdb` and `pg_ctl`.
- Git and internet access to download dependencies.

On Ubuntu, install Git and PostgreSQL with:

```bash
sudo apt update
sudo apt install -y git postgresql ca-certificates
```

Install Node.js using the [official instructions](https://nodejs.org/en/download).
With nvm, run `nvm install 24` and `nvm use 24`. In WSL, install and use the Linux
versions of Node.js, npm, and PostgreSQL.

## Run from a fresh clone

```bash
git clone https://github.com/Davisgrmn/AccessDeck.git
cd AccessDeck
./start.sh
```

Run as your normal user, **without sudo**. Open **http://localhost:3000/** when the
script prints the ready message. Press **Ctrl+C** to stop.

The script checks prerequisites, installs project dependencies, builds the app,
creates and seeds a private PostgreSQL database, and starts the server. No manual
`.env`, database, migration, or build setup is needed. AWS access is not required
to run locally.

Running it again preserves data and credentials. Generated `.env` and `.local/`
files are ignored by Git; keep them together and never commit them or private keys.

## Checks

```bash
npm run lint
npm run typecheck
npm test
```

Tests include a temporary PostgreSQL instance and leave your application database
untouched. They cover authentication, sessions, role checks, and organization isolation.

## Accounts and pages

- `/register`: create a customer account and a new organization on the Free plan.
- `/login`: sign in; use **Sign out** in the header to end the session.
- `/dashboard`: customer or manager summary and role-specific navigation.
- `/organization`: the signed-in customer's subscription and private report previews.
- `/manage`: manager-only organization list; **View organization** opens its workspace.

Registration never grants manager permissions or joins an existing organization by
name. The backend checks roles and organization ownership on every protected request.
Public report samples on `/` are explicitly fictional; registered organizations'
reports remain private. Sessions are stored in PostgreSQL, expire after 12 hours,
and survive application restarts. Passwords use salted scrypt hashes.

Create a manager in a **second local terminal while the app is running**:

```bash
npm run manager:create
```

Enter a name, email, and a password of 12–128 characters at the prompts. Password
entry is hidden. This command can activate the inactive `manager@example.test`
fixture or create a new manager; it refuses to overwrite active accounts or promote
customers. Seeded customer accounts are inactive and have no default passwords.
