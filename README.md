# AccessDeck

A CS408 subscription access and usage management project using React, Express,
TypeScript, and PostgreSQL.

## Prerequisites

- Linux and Bash. On Windows, use Ubuntu in WSL.
- Node.js **22.12+** and npm; **Node.js 24** is recommended (`.nvmrc`).
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
