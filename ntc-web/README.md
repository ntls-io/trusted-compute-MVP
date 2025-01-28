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
