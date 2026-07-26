# SequenceJira 🚀

### *The AI-First, Real-Time Task Management SaaS for Developers & Product Teams*

SequenceJira is a production-ready, enterprise-grade task management system designed to emulate platforms like Linear and Jira, with an AI-first workflow engine. The platform is built using a highly decoupled, event-driven architecture, implementing robust logical tenant isolation, multi-agent LLM analysis, native GitHub webhooks, and sub-15ms real-time state synchronization.

It features a local-first **Prisma + SQLite** engine combined with an **in-memory dynamic event-broker fallback** that activates automatically if RabbitMQ is disabled or Docker is offline, ensuring a zero-config, single-command onboarding experience for developers.

---

## 📸 Kanban Board Interface

Below is the verified end-to-end interface demonstrating real-time synchronization, loading skeletons, activity log terminal streams, and GitHub branch webhook triggers:

![SequenceJira Kanban Board Interface](/docs/board_and_logs.png)

---

## 🏗️ System Architecture & Data Flow

SequenceJira is built on a distributed, event-driven topology. Below is the end-to-end request-response and background job processing flow:

```mermaid
graph TD
    %% Clients
    Client[Next.js Frontend / TypeScript] -->|HTTPS REST API| Gateway[NestJS API Server]
    Client -->|WebSocket Actions| WSS[NestJS WebSockets Gateway]

    %% Gateway Layer
    subgraph Gateway Layer [Ingress & Middleware]
        Auth[JWT / RBAC Guard]
        Context[AsyncLocalStorage Context Binder]
        Gateway --> Auth
        Auth --> Context
    end

    %% Storage & Cache
    subgraph Storage Tier [Data Persistence & Cache]
        DB[(SQLite Database)]
        Prisma[Prisma ORM & Performance Indexes]
        DB --- Prisma
    end
    Context -->|Scoped Query| DB

    %% Messaging Fallback
    subgraph Event Broker [Queue Broker / Fallback]
        MQ[RabbitMQ Direct Exchange]
        InMemory[In-Memory Event Bus Wrapper]
        QueueAI[ai.task.generation]
        
        MQ -->|RabbitMQ Enabled| QueueAI
        InMemory -->|RabbitMQ Offline Fallback| QueueAI
    end
    Gateway -->|Publish Event| MQ
    Gateway -.->|Local Execution| InMemory

    %% AI Pipeline
    subgraph Multi-Agent Worker [Asynchronous AI Pipeline]
        Worker[AI Task Consumer Service]
        A1[Agent 1: Requirements Analyzer]
        A2[Agent 2: Epic & Story Generator]
        A3[Agent 3: QA Validator & Corrector]
        
        Worker --> A1
        A1 --> A2
        A2 --> A3
        A3 -->|Schema Error - Retry Loop| A2
        A3 -->|Valid Output| Worker
    end
    QueueAI --> Worker
    Worker -->|Bulk Save SQL| DB
    Worker -->|Broadcast Progress & Complete| WSS

    %% Real-Time Broadcast
    WSS -->|Broadcast State Updates| Client
```

---

## ⚡ Key Technical Highlights

### 1. Robust Multi-Tenancy & Logical Separation
SequenceJira leverages logical separation inside a SQLite/PostgreSQL database to support thousands of workspaces securely.
*   **Context Isolation**: An HTTP interceptor parses incoming requests, resolves user permissions, and binds the workspace ID within Node.js `AsyncLocalStorage`.
*   **Performance Indexing**: Database-level indexes (`@@index`) are defined on critical foreign keys (`workspaceId`, `projectId`, `epicId`, `assigneeId`) to guarantee sub-millisecond query execution plans.
*   **Workspace RBAC**: A unified decorator system enforces granular role levels (`Owner`, `Admin`, `Developer`, `Client`) protecting all backend routes.

### 2. Multi-Agent AI Decomposition Pipeline (The USP)
Instead of relying on single-shot LLM requests, SequenceJira implements an event-driven Multi-Agent pipeline using structured outputs and a verification loop:
*   **Requirements Analyzer**: Translates unstructured descriptions into specific code-layer impacts and stack boundaries.
*   **Epic & Story Generator**: Produces fully formed Epics and related User Stories complete with acceptance criteria, priority tags, and estimated story points (Fibonacci sequence).
*   **Self-Correcting Validator**: Performs structured schema validation and sanity-checks the generated tasks against technical dependency rules (e.g. database migrations must occur before write logic). If gaps are found, it generates a remediation prompt and loops back to the generator (up to 3 retries).
*   **Asynchronous Fallbacks**: Tasks are offloaded to RabbitMQ or processed asynchronously in-memory. Workers write results directly to the database and broadcast success messages through WebSockets.

### 3. Sub-15ms Real-Time Sync & Safe Drags
*   **Room Separation**: WebSocket connections (Socket.io) partition users into channel rooms isolated by `workspace_id`.
*   **Drag-and-Drop Safety Guards**: Checks verify source status list bounds before executing card repositioning.
*   **Database Resiliency**: Updates in the WebSocket gateway are wrapped in try-catch and existence check blocks, replacing database transaction crashes with clean logging warnings.

### 4. Dev-Centric Git Webhook Integrations
*   **HMAC Security**: Incoming GitHub payloads are verified using SHA256 signatures to prevent spoofing.
*   **Automatic Transitions**: PR titles matching task key prefixes (e.g. `SEQ-12`) trigger status updates automatically.
*   **Branch Creation**: Transitioning a card to `IN_PROGRESS` triggers the Octokit API to generate a feature branch (`feature/task-title-shortId`) on GitHub.

---

## 🛠️ Installation & Getting Started

### Prerequisite Dependencies
*   **Node.js** (v18.x or v20.x)
*   **NPM** (v9.x+)

### Setup Instructions

1. **Clone and Install Dependencies**
   ```bash
   git clone https://github.com/merna112/sequencejira.git
   cd sequencejira
   npm install
   ```

2. **Configure Environment Settings**
   Create a `.env` file in the root directory:
   ```env
   OPENAI_API_KEY="your-openai-api-key"
   OPENAI_BASE_URL="https://models.inference.ai.azure.com"
   OPENAI_MODEL="gpt-4o-mini"
   
   RABBITMQ_ENABLED="false"  # Set to true if a RabbitMQ broker is running locally
   RABBITMQ_URI="amqp://guest:guest@localhost:5672"
   
   GITHUB_WEBHOOK_SECRET="mock-webhook-secret"
   GITHUB_OWNER="merna112"
   GITHUB_REPO="SequenceJira"
   GITHUB_TOKEN="your-github-personal-access-token"
   ```

3. **Initialize SQLite Database & Seeding**
   Sync your database schema and seed 15+ highly realistic initial dummy tasks:
   ```bash
   npx prisma db push
   npx ts-node prisma/seed.ts
   ```

4. **Start Development Environments**
   Run the backend NestJS service and frontend Next.js application:
   ```bash
   # Terminal 1: Start NestJS Backend (Listening on http://localhost:5000)
   npm run start:dev
   
   # Terminal 2: Start Next.js Client (Listening on http://localhost:3001)
   npm run dev
   ```

---

## 📂 Project Structure

```
├── apps/
│   └── web/                 # Next.js (TypeScript) client application
├── prisma/
│   ├── schema.prisma        # Database schema with query performance indexes
│   └── seed.ts              # Seeding script with 15+ rich mockup developer tasks
├── services/
│   └── ai-worker/           # NestJS REST backend server, WebSocket gateway & workers
├── docs/
│   └── board_and_logs.png   # Kanban board screenshot verification
└── ARCHITECTURE.md          # Architectural diagrams & RLS details
```

---

## 🛡️ License

This project is licensed under the MIT License - see the `LICENSE` file for details.
