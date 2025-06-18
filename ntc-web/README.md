<!--
Nautilus Trusted Compute  
Copyright (C) 2025 Nautilus  

This program is free software: you can redistribute it and/or modify  
it under the terms of the GNU Affero General Public License as published  
by the Free Software Foundation, either version 3 of the License, or  
(at your option) any later version.  

This program is distributed in the hope that it will be useful,  
but WITHOUT ANY WARRANTY; without even the implied warranty of  
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the  
GNU Affero General Public License for more details.  

You should have received a copy of the GNU Affero General Public License  
along with this program. If not, see <https://www.gnu.org/licenses/>.  
-->

# Nautilus MVP Web Application

## Overview

This web application provides a user interface for creating and managing data pools using the NTC platform. Built with Next.js and React, it features a modern, responsive design with component shadcn/ui.

## Prerequisites

* Node.js (v22 or higher)
* npm (v11 or higher)

## Dependencies

The project uses the following key dependencies:

* Next.js 15.1.4
* React 19
* Tailwind CSS
* shadcn/ui components
* Lucide React (for icons)

## Getting Started

### Install dependencies:

```
npm install
```

Install and initialize shadcn/ui
```
npx shadcn@latest init
```

### Development

First, run the development server:

```bash
npm run dev
```

The application will be available at [http://localhost:3000](http://localhost:3000).

### Setting Up Environment Variables for Clerk Authentication

To enable Clerk authentication, create a `.env.local` file in the root of your project with the following variables:

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
```

Make sure to replace the placeholder values with your actual Clerk keys and URLs.

## Database Setup

### PostgreSQL with Docker

1. Install Docker if you haven't already
2. Run PostgreSQL container:
```bash
docker run --name postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres
```

3. Create the development database:
```bash
docker exec -it postgres psql -U postgres -c "CREATE DATABASE ntls_dev;"
```

### Prisma Setup

1. Create `.env` file in the project root:
    ```
    DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ntls_dev?schema=public"
    ```

2. Push the schema to the database:
    ```bash
    npx prisma db push
    ```

3. Seed the database with initial data (`prisma/seed.ts`):
    ```bash
    npx prisma db seed
    ```

4. Run database tests to verify setup (`scripts/test-db.ts`):
    ```bash
    npm run test:db
    ```

### Useful Database Commands

- Start Prisma Studio (GUI for database):
    ```bash
    npx prisma studio
    ```

- Reset database (⚠️ deletes all data):
    ```bash
    npx prisma db push --force-reset
    ```

- Update Prisma client after schema changes:
    ```bash
    npx prisma generate
    ```

### Troubleshooting

If you encounter issues with the TypeScript configuration when seeding:
1. Verify `tsconfig.seed.json` exists in the project root
2. Ensure all dependencies are installed:
    ```bash
    npm install -D ts-node typescript @types/node
    ```
