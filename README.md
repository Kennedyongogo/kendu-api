# Express API Application

This is an Express.js application that serves as a backend for various functionalities such as user authentication, land parcel management, adminUnits data handling, ownership details, and valuations. The application is structured with modular routes and middleware to ensure maintainability and scalability.

## Table of Contents

- [Features](#features)
- [Technologies Used](#technologies-used)
- [Installation Steps](#installation-steps)

## Features

- User authentication and authorization
- CRUD operations for land parcels
- AdminUnits data management
- Ownership details tracking
- Valuation services
- Rate limiting for API requests
- Cookie parsing for session management

## Technologies Used

- Node.js
- Express.js
- PostgreSQL
- Cookie-parser middleware
- Custom middleware for rate limiting and error handling

## Installation Steps

### Step 1

Clone the repository to your local machine:

```bash
git clone <https://github.com/mutetid/Homabay-LIMS-API.git>
cd <LIMS-API>
```

### Step 2

Install all packages by running:

```bash
npm install
```

### Step 3

Run the application using:

```bash
nodemon .\src\server.js
```
