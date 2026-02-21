# Instagram Bridge Project Context

## Project Overview

**Project Name:** `instagram-bridge`
**Type:** Backend Application (NestJS)
**Purpose:** A bridge service likely intended to integrate with Instagram APIs (currently in initial scaffold state).

This project is built using the [NestJS](https://nestjs.com/) framework, a progressive Node.js framework for building efficient, reliable, and scalable server-side applications.

## Getting Started

### Prerequisites

*   **Node.js:** Ensure a modern version of Node.js is installed (likely v20+ given the dependencies).
*   **Package Manager:** npm

### Installation

Install the project dependencies:

```bash
npm install
```

### Running the Application

*   **Development Mode (Watch):**
    ```bash
    npm run start:dev
    ```
    This helps in development by automatically restarting the server on file changes.

*   **Production Mode:**
    ```bash
    npm run start:prod
    ```
    Runs the compiled application from the `dist/` directory.

*   **Standard Start:**
    ```bash
    npm run start
    ```

### Building

Compile the TypeScript source code into JavaScript in the `dist/` directory:

```bash
npm run build
```

## Testing

The project uses [Jest](https://jestjs.io/) for testing.

*   **Unit Tests:**
    ```bash
    npm run test
    ```
    Runs tests located in `src/` ending with `.spec.ts`.

*   **End-to-End (e2e) Tests:**
    ```bash
    npm run test:e2e
    ```
    Runs integration tests located in the `test/` directory.

*   **Test Coverage:**
    ```bash
    npm run test:cov
    ```

## Project Structure

*   `src/`: Contains the main application source code.
    *   `main.ts`: The entry point of the application.
    *   `app.module.ts`: The root module of the application.
    *   `app.controller.ts`: Basic controller with a single route.
    *   `app.service.ts`: Basic service with business logic.
*   `test/`: Contains end-to-end (e2e) tests.
*   `dist/`: (Generated) Contains the compiled JavaScript output.
*   `node_modules/`: (Generated) Contains project dependencies.

## Development Conventions

*   **Language:** TypeScript
*   **Framework:** NestJS (Modular architecture with Controllers, Providers, and Modules).
*   **Code Style:**
    *   **Linting:** ESLint (`npm run lint`)
    *   **Formatting:** Prettier (`npm run format`)
*   **Configuration:**
    *   `tsconfig.json`: TypeScript configuration.
    *   `nest-cli.json`: NestJS CLI configuration.
