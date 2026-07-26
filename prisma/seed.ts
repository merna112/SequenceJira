import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding rich database...');

  const workspaceId = '11111111-1111-1111-1111-111111111111';
  const projectId = '22222222-2222-2222-2222-222222222222';
  const userId = 'user-id-placeholder';

  // 1. Seed Workspace
  const workspace = await prisma.workspace.upsert({
    where: { id: workspaceId },
    update: {},
    create: {
      id: workspaceId,
      name: 'Acme Development',
      slug: 'acme-dev',
    },
  });

  // 2. Seed User
  const user = await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: {
      id: userId,
      email: 'dev@sequencejira.io',
      fullName: 'Lead Developer',
      passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890',
    },
  });

  // 3. Seed Workspace Membership
  const member = await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId,
      },
    },
    update: {},
    create: {
      workspaceId,
      userId,
      role: 'OWNER',
    },
  });

  // 4. Seed Project
  const project = await prisma.project.upsert({
    where: {
      workspaceId_keyPrefix: {
        workspaceId,
        keyPrefix: 'SEQ',
      },
    },
    update: {},
    create: {
      id: projectId,
      workspaceId,
      name: 'Core Platform Refactor',
      keyPrefix: 'SEQ',
      description: 'The core platform migration and feature updates tracking board.',
    },
  });

  // 5. Clean up old seed epics and tasks to prevent duplication issues
  await prisma.task.deleteMany({ where: { projectId } });
  await prisma.epic.deleteMany({ where: { projectId } });

  // 6. Create Epics
  const epic1 = await prisma.epic.create({
    data: {
      workspaceId,
      projectId,
      title: 'Authentication Infrastructure',
      description: 'Establish tenant-safe access layers, JWT auth token logic, and logical isolation layers.',
    },
  });

  const epic2 = await prisma.epic.create({
    data: {
      workspaceId,
      projectId,
      title: 'Stripe Billing SaaS Pipeline',
      description: 'Integrate Stripe Checkout, webhook verification guards, subscription lifecycles, and webhook-driven account upgrades.',
    },
  });

  const epic3 = await prisma.epic.create({
    data: {
      workspaceId,
      projectId,
      title: 'Collaborative Real-time Kanban',
      description: 'Build sub-15ms WebSocket synchronizers, order streams, drag-and-drop client, and Git webhook branch automated triggers.',
    },
  });

  // 7. Seed Tasks
  const tasksData = [
    // --- Epic 1: Auth Infrastructure ---
    {
      epicId: epic1.id,
      key: 'SEQ-1',
      title: 'Configure Node AsyncLocalStorage Context',
      description: 'Create middleware to intercept incoming requests, parse workspace ID, and bind it to Node execution storage for logical tenant isolation.',
      status: 'DONE',
      priority: 'CRITICAL',
      storyPoints: 3,
      branchName: 'feature/async-local-storage-seq-1',
      branchUrl: 'https://github.com/merna112/SequenceJira/tree/feature/async-local-storage-seq-1',
      pullRequestUrl: 'https://github.com/merna112/SequenceJira/pull/1',
      acceptanceCriteria: ['- [ ] Context resolved on header', '- [ ] Isolation active under test mock scripts'],
    },
    {
      epicId: epic1.id,
      key: 'SEQ-2',
      title: 'Implement JWT Token Authorization Decorator',
      description: 'Build NestJS guards to verify Bearer JWT token structures, check client credentials, and decode token payloads.',
      status: 'DONE',
      priority: 'HIGH',
      storyPoints: 2,
      branchName: 'feature/jwt-auth-decorator-seq-2',
      branchUrl: 'https://github.com/merna112/SequenceJira/tree/feature/jwt-auth-decorator-seq-2',
      pullRequestUrl: 'https://github.com/merna112/SequenceJira/pull/2',
      acceptanceCriteria: ['- [ ] Guard rejects invalid tokens', '- [ ] Decorator injects sub workspace data successfully'],
    },
    {
      epicId: epic1.id,
      key: 'SEQ-3',
      title: 'Add Row Level Security Policies to PostgreSQL',
      description: 'Enable RLS on tasks, comments, and audit logs. Verify connection pool invokes SET LOCAL app.current_workspace_id before transaction execs.',
      status: 'IN_PROGRESS',
      priority: 'CRITICAL',
      storyPoints: 5,
      branchName: 'feature/postgres-rls-policies-seq-3',
      branchUrl: 'https://github.com/merna112/SequenceJira/tree/feature/postgres-rls-policies-seq-3',
      acceptanceCriteria: ['- [ ] Tenant separation works in raw SQL queries', '- [ ] RLS throws error on cross-tenant select attempts'],
    },
    {
      epicId: epic1.id,
      key: 'SEQ-4',
      title: 'Create Account Workspace Invitations Flow',
      description: 'Implement invitations model and endpoints. Invitees must receive an email containing a signed token to register.',
      status: 'TODO',
      priority: 'MEDIUM',
      storyPoints: 5,
      acceptanceCriteria: ['- [ ] Expiry date limits token validation', '- [ ] Accepting invitation links workspace member entry'],
    },

    // --- Epic 2: Stripe Billing ---
    {
      epicId: epic2.id,
      key: 'SEQ-5',
      title: 'Integrate Stripe Customer Portal Checkout API',
      description: 'Connect checkout sessions route. Allow developers to select either Monthly Professional ($20) or Enterprise ($120) billing plans.',
      status: 'DONE',
      priority: 'HIGH',
      storyPoints: 5,
      branchName: 'feature/stripe-checkout-portal-seq-5',
      branchUrl: 'https://github.com/merna112/SequenceJira/tree/feature/stripe-checkout-portal-seq-5',
      pullRequestUrl: 'https://github.com/merna112/SequenceJira/pull/3',
      acceptanceCriteria: ['- [ ] Redirects correctly to stripe portal page', '- [ ] Session metadata includes workspace ID'],
    },
    {
      epicId: epic2.id,
      key: 'SEQ-6',
      title: 'Develop Stripe Webhook Handler for Payment Success',
      description: 'Listen to invoice.paid and checkout.session.completed events. Update active workspace subscription tier dynamically on successful checkout.',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      storyPoints: 3,
      branchName: 'feature/stripe-webhooks-handler-seq-6',
      branchUrl: 'https://github.com/merna112/SequenceJira/tree/feature/stripe-webhooks-handler-seq-6',
      acceptanceCriteria: ['- [ ] HMAC verification works with local webhook secret', '- [ ] Payment failure logs warning in audits table'],
    },
    {
      epicId: epic2.id,
      key: 'SEQ-7',
      title: 'Write Customer Portal billing management routing',
      description: 'Provide an endpoint that returns a pre-signed Stripe Billing Portal configuration URL. Allow users to cancel or swap plans.',
      status: 'TODO',
      priority: 'LOW',
      storyPoints: 2,
      acceptanceCriteria: ['- [ ] Returns 302 redirect URL to customer portal', '- [ ] Portal allows plan changes'],
    },
    {
      epicId: epic2.id,
      key: 'SEQ-8',
      title: 'Graceful billing subscription expiry handling',
      description: 'Implement background worker scheduler checking daily for workspaces with expired plan timestamps. Revoke privileges to developer tier on expiry.',
      status: 'TODO',
      priority: 'HIGH',
      storyPoints: 3,
      acceptanceCriteria: ['- [ ] CRON job runs successfully at midnight', '- [ ] Restricts dashboard features on tier fallback'],
    },

    // --- Epic 3: Kanban WebSocket ---
    {
      epicId: epic3.id,
      key: 'SEQ-9',
      title: 'Initialize Socket.io WebSocket Connection Bridge',
      description: 'Set up NestJS Socket.io server. Handshake verifies JWT token and separates clients into dynamic room scopes by workspace ID.',
      status: 'DONE',
      priority: 'CRITICAL',
      storyPoints: 3,
      branchName: 'feature/socket-io-bridge-seq-9',
      branchUrl: 'https://github.com/merna112/SequenceJira/tree/feature/socket-io-bridge-seq-9',
      pullRequestUrl: 'https://github.com/merna112/SequenceJira/pull/4',
      acceptanceCriteria: ['- [ ] Sockets map to correct rooms on connect', '- [ ] Failed auth terminates socket channel bridge'],
    },
    {
      epicId: epic3.id,
      key: 'SEQ-10',
      title: 'Build drag-and-drop state broadcast synchronizers',
      description: 'Listen to task:move socket signals. Broadcast task:moved payload to all concurrent workspace members excluding the drag initiator.',
      status: 'IN_REVIEW',
      priority: 'HIGH',
      storyPoints: 3,
      branchName: 'feature/board-sync-broadcast-seq-10',
      branchUrl: 'https://github.com/merna112/SequenceJira/tree/feature/board-sync-broadcast-seq-10',
      pullRequestUrl: 'https://github.com/merna112/SequenceJira/pull/5',
      acceptanceCriteria: ['- [ ] State updates in under 15ms across room tabs', '- [ ] Drag updates task status fields in database'],
    },
    {
      epicId: epic3.id,
      key: 'SEQ-11',
      title: 'Integrate Redis streams queue for order serialization',
      description: 'Stream kanban ranking changes through Redis Streams to eliminate database race conditions and card sorting conflicts during simultaneous updates.',
      status: 'TODO',
      priority: 'MEDIUM',
      storyPoints: 5,
      acceptanceCriteria: ['- [ ] Stream processes rank computations sequentially', '- [ ] Restores card visual list integrity under heavy load'],
    },
    {
      epicId: epic3.id,
      key: 'SEQ-12',
      title: 'Automate GitHub Branch Creation on Task Start',
      description: 'Trigger GitHub API branch creation flow whenever a developer drags a TODO card to IN_PROGRESS. Format: feature/title-shortId.',
      status: 'DONE',
      priority: 'MEDIUM',
      storyPoints: 2,
      branchName: 'feature/github-branch-automation-seq-12',
      branchUrl: 'https://github.com/merna112/SequenceJira/tree/feature/github-branch-automation-seq-12',
      pullRequestUrl: 'https://github.com/merna112/SequenceJira/pull/6',
      acceptanceCriteria: ['- [ ] Branch created on GitHub repo if API is online', '- [ ] Cards display active branch badge linking to source'],
    },
    {
      epicId: epic3.id,
      key: 'SEQ-13',
      title: 'Parse incoming GitHub Webhooks for state automation',
      description: 'Verify HMAC payload signature. If PR title contains SEQ-ID, transition status automatically (opened ➔ IN_REVIEW, merged ➔ DONE).',
      status: 'IN_REVIEW',
      priority: 'HIGH',
      storyPoints: 3,
      branchName: 'feature/github-webhooks-automation-seq-13',
      branchUrl: 'https://github.com/merna112/SequenceJira/tree/feature/github-webhooks-automation-seq-13',
      pullRequestUrl: 'https://github.com/merna112/SequenceJira/pull/7',
      acceptanceCriteria: ['- [ ] Signature check blocks mock requests', '- [ ] Transition actions execute DB writes and socket broadcasts'],
    },
    {
      epicId: epic3.id,
      key: 'SEQ-14',
      title: 'Configure local-first loading skeletons on Kanban',
      description: 'Implement visual skeleton state indicators during board REST loading phase to eliminate initial load UI flicker.',
      status: 'IN_PROGRESS',
      priority: 'LOW',
      storyPoints: 1,
      branchName: 'feature/loading-skeletons-seq-14',
      branchUrl: 'https://github.com/merna112/SequenceJira/tree/feature/loading-skeletons-seq-14',
      acceptanceCriteria: ['- [ ] Skeletons display across columns during fetch', '- [ ] Replaced cleanly by active tasks on load complete'],
    },
    {
      epicId: epic3.id,
      key: 'SEQ-15',
      title: 'Add optimistic locking state conflict toasts',
      description: 'Implement version checks on update. Show warning toast notification and roll back card drag visual if backend returns a version conflict.',
      status: 'TODO',
      priority: 'HIGH',
      storyPoints: 2,
      acceptanceCriteria: ['- [ ] Checks version mismatch during DB write', '- [ ] Triggers error alert and rolls back card visual position'],
    }
  ];

  for (const taskData of tasksData) {
    const createdTask = await prisma.task.create({
      data: {
        workspaceId,
        projectId,
        epicId: taskData.epicId,
        key: taskData.key,
        title: taskData.title,
        description: taskData.description,
        status: taskData.status,
        priority: taskData.priority,
        storyPoints: taskData.storyPoints,
        branchName: taskData.branchName,
        branchUrl: taskData.branchUrl,
        pullRequestUrl: taskData.pullRequestUrl,
        acceptanceCriteria: JSON.stringify(taskData.acceptanceCriteria),
      },
    });
    console.log('Created rich Task:', createdTask.key);
  }

  console.log('Database seeded with rich production-grade tasks!');
}

main()
  .catch((e) => {
    console.error('Error during rich seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
