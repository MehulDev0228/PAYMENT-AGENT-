import { applicablePolicyStep, defaultPolicy, priorityFor } from "@/lib/domain/policy";
import { daysBetween, isoDate } from "@/lib/domain/money";
import type { CollectionAction, CollectionCase, CommunicationMessage, Customer, DataSet, Invoice, Payment, PaymentPromise } from "@/lib/domain/types";

export const DEMO_COMPANY_ID = "00000000-0000-0000-0000-000000000001";
export const DEMO_NOW = new Date("2026-09-27T09:00:00.000Z");

const companyWords = ["Atlas", "Bluebird", "Cedar", "Delta", "Evergreen", "Forge", "Granite", "Harbor", "Indigo", "Juniper", "Keystone", "Lumen", "Meridian", "Nimbus", "Orchid", "Pioneer", "Quartz", "Redwood", "Summit", "Tangent"];
const companyTypes = ["Foods", "Logistics", "Systems", "Textiles", "Industries", "Retail", "Works", "Healthcare", "Trading", "Manufacturing"];
const managers = ["Ananya Rao", "Karan Mehta", "Mira Shah", "Rohit Menon", "Sara D'Souza"];
const regions = ["North", "South", "East", "West", "Central"];

function dateOffset(days: number): string {
  const d = new Date(DEMO_NOW);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

function makeCustomer(index: number): Customer {
  const word = companyWords[index % companyWords.length];
  const type = companyTypes[Math.floor(index / companyWords.length) % companyTypes.length];
  return {
    id: `cust-${String(index + 1).padStart(3, "0")}`,
    companyId: DEMO_COMPANY_ID,
    customerCode: `CUS-${String(index + 1).padStart(4, "0")}`,
    name: `${word} ${type} ${Math.floor(index / 200) + 1}`,
    email: `accounts${index + 1}@${word.toLowerCase()}-${type.toLowerCase()}.example`,
    phone: `+91 90000 ${String(index).padStart(5, "0")}`,
    region: regions[index % regions.length],
    accountManager: managers[index % managers.length],
    status: index % 47 === 0 ? "on_hold" : "active",
    createdAt: "2025-01-02T09:00:00.000Z",
  };
}

function invoiceState(index: number, amount: number, dueDate: string): Pick<Invoice, "amountPaid" | "amountOutstanding" | "status"> {
  if (index % 11 === 0) return { amountPaid: amount, amountOutstanding: 0, status: "paid" };
  if (index % 7 === 0) return { amountPaid: Math.round(amount * 0.4), amountOutstanding: Math.round(amount * 0.6), status: "partially_paid" };
  if (new Date(dueDate) < DEMO_NOW) return { amountPaid: 0, amountOutstanding: amount, status: "overdue" };
  return { amountPaid: 0, amountOutstanding: amount, status: "pending" };
}

export function createSeedData(): DataSet {
  const customers = Array.from({ length: 200 }, (_, index) => makeCustomer(index));
  const invoices: Invoice[] = [];

  for (let index = 0; index < 1000; index += 1) {
    const customer = customers[index % customers.length];
    const amount = 18_000 + ((index * 7_919) % 582_000);
    const dueOffset = (index % 83) - 52;
    const dueDate = dateOffset(dueOffset);
    const state = invoiceState(index, amount, dueDate);
    invoices.push({
      id: `inv-${String(index + 1).padStart(4, "0")}`,
      companyId: DEMO_COMPANY_ID,
      customerId: customer.id,
      invoiceNumber: `INV-${1001 + index}`,
      invoiceDate: dateOffset(dueOffset - 30),
      dueDate,
      amount,
      currency: "INR",
      ...state,
      source: "synthetic_seed",
      createdAt: `${dateOffset(dueOffset - 30)}T09:00:00.000Z`,
      updatedAt: "2026-09-27T09:00:00.000Z",
    });
  }

  const acceptanceInvoice = invoices.find((invoice) => invoice.invoiceNumber === "INV-1042")!;
  acceptanceInvoice.amount = 84_000;
  acceptanceInvoice.amountPaid = 0;
  acceptanceInvoice.amountOutstanding = 84_000;
  acceptanceInvoice.invoiceDate = "2026-08-21";
  acceptanceInvoice.dueDate = "2026-09-20";
  acceptanceInvoice.status = "overdue";

  const payments: Payment[] = [];
  const invoicesWithPayments = invoices.filter((candidate) => candidate.amountPaid > 0);
  const targetPaymentCount = 560;
  const baseInstallments = Math.floor(targetPaymentCount / invoicesWithPayments.length);
  const extraInstallments = targetPaymentCount % invoicesWithPayments.length;

  for (const [invoiceIndex, invoice] of invoicesWithPayments.entries()) {
    const installmentCount = baseInstallments + (invoiceIndex < extraInstallments ? 1 : 0);
    const baseAmount = Math.floor(invoice.amountPaid / installmentCount);

    for (let installment = 0; installment < installmentCount; installment += 1) {
      const amount =
        installment === installmentCount - 1
          ? invoice.amountPaid - baseAmount * (installmentCount - 1)
          : baseAmount;

      payments.push({
        id: `pay-${String(payments.length + 1).padStart(4, "0")}`,
        companyId: DEMO_COMPANY_ID,
        invoiceId: invoice.id,
        customerId: invoice.customerId,
        paymentReference: `UTR-${invoice.invoiceNumber}-${String(payments.length + 91_001)}`,
        amount,
        paymentDate: invoice.status === "paid" ? dateOffset(-((payments.length % 24) + 1)) : dateOffset(-4),
        source: "synthetic_seed",
        matchStatus: "matched",
        matchNotes: `Seeded installment ${installment + 1} of ${installmentCount}`,
        createdAt: "2026-09-27T09:00:00.000Z",
      });
    }
  }

  payments.push({
    id: "pay-ambiguous-001",
    companyId: DEMO_COMPANY_ID,
    paymentReference: "UTR-REVIEW-84000",
    amount: 84_000,
    paymentDate: "2026-09-26",
    source: "synthetic_seed",
    matchStatus: "payment_match_review_required",
    matchNotes: "Could potentially match INV-1042 and another customer invoice; review required",
    createdAt: "2026-09-26T11:00:00.000Z",
  });

  const cases: CollectionCase[] = invoices
    .filter((invoice) => invoice.amountOutstanding > 0 && new Date(invoice.dueDate) <= DEMO_NOW)
    .map((invoice, index) => {
      const overdue = daysBetween(invoice.dueDate, DEMO_NOW);
      const status: CollectionCase["status"] = overdue >= 30 ? "escalated" : overdue >= 7 ? "reminder_sent" : "overdue";
      return {
        id: `case-${String(index + 1).padStart(4, "0")}`,
        companyId: DEMO_COMPANY_ID,
        invoiceId: invoice.id,
        customerId: invoice.customerId,
        status,
        priority: priorityFor(overdue, invoice.amountOutstanding),
        daysOverdue: overdue,
        nextAction: status === "escalated" ? "Manager review" : "Evaluate collection policy",
        nextActionAt: dateOffset(status === "escalated" ? 0 : 1),
        assignedTo: managers[index % managers.length],
        createdAt: `${invoice.dueDate}T08:00:00.000Z`,
        updatedAt: "2026-09-27T09:00:00.000Z",
      };
    });

  const acceptanceCase = cases.find((item) => item.invoiceId === acceptanceInvoice.id)!;
  acceptanceCase.status = "payment_promised";
  acceptanceCase.priority = "medium";
  acceptanceCase.daysOverdue = 7;
  acceptanceCase.nextAction = "Verify promised payment";
  acceptanceCase.nextActionAt = "2026-09-29";

  const actions: CollectionAction[] = [];
  const communications: CommunicationMessage[] = [];
  const promises: PaymentPromise[] = [];

  const seedPolicy = defaultPolicy(DEMO_COMPANY_ID);
  for (const [index, collectionCase] of cases.slice(0, 160).entries()) {
    const invoice = invoices.find((item) => item.id === collectionCase.invoiceId)!;
    const customer = customers.find((item) => item.id === collectionCase.customerId)!;
    const isEscalation = collectionCase.daysOverdue >= 15;
    actions.push({
      id: `action-${String(index + 1).padStart(4, "0")}`,
      companyId: DEMO_COMPANY_ID,
      collectionCaseId: collectionCase.id,
      invoiceId: invoice.id,
      customerId: customer.id,
      actionType: isEscalation ? "escalation" : "reminder",
      channel: isEscalation ? "internal" : "email",
      message: isEscalation ? `Review ${invoice.invoiceNumber}; it is ${collectionCase.daysOverdue} days overdue.` : `A concise reminder for ${invoice.invoiceNumber}.`,
      reason: `Default collection policy threshold reached at ${collectionCase.daysOverdue} days overdue.`,
      dataSnapshot: { invoiceNumber: invoice.invoiceNumber, amountOutstanding: invoice.amountOutstanding, daysOverdue: collectionCase.daysOverdue, policyStepId: applicablePolicyStep(invoice, seedPolicy, DEMO_NOW)?.id },
      scheduledAt: dateOffset(-1),
      executedAt: isEscalation ? undefined : `${dateOffset(-1)}T05:30:00.000Z`,
      status: isEscalation ? "awaiting_approval" : "executed",
      createdBy: "aera",
      createdAt: `${dateOffset(-1)}T05:25:00.000Z`,
    });
  }

  const missedCases = cases.filter((item) => item.daysOverdue >= 20).slice(0, 18);
  for (const [index, collectionCase] of missedCases.entries()) {
    promises.push({
      id: `promise-missed-${String(index + 1).padStart(3, "0")}`,
      companyId: DEMO_COMPANY_ID,
      invoiceId: collectionCase.invoiceId,
      customerId: collectionCase.customerId,
      promisedAmount: invoices.find((item) => item.id === collectionCase.invoiceId)?.amountOutstanding,
      promisedDate: dateOffset(-((index % 6) + 1)),
      sourceMessageId: `message-promise-${index + 1}`,
      status: "missed",
      createdAt: `${dateOffset(-10)}T10:00:00.000Z`,
      updatedAt: "2026-09-27T06:00:00.000Z",
    });
  }

  promises.push({
    id: "promise-inv-1042",
    companyId: DEMO_COMPANY_ID,
    invoiceId: acceptanceInvoice.id,
    customerId: acceptanceInvoice.customerId,
    promisedAmount: 84_000,
    promisedDate: "2026-09-29",
    sourceMessageId: "msg-inv-1042-reply",
    status: "active",
    createdAt: "2026-09-25T10:30:00.000Z",
    updatedAt: "2026-09-25T10:30:00.000Z",
  });

  const acceptanceCustomer = customers.find((item) => item.id === acceptanceInvoice.customerId)!;
  communications.push(
    {
      id: "msg-inv-1042-reminder",
      companyId: DEMO_COMPANY_ID,
      customerId: acceptanceCustomer.id,
      invoiceId: acceptanceInvoice.id,
      collectionCaseId: acceptanceCase.id,
      channel: "email",
      direction: "outbound",
      externalMessageId: "gmail-demo-outbound-1042",
      subject: "Reminder: INV-1042 is now due",
      body: `Hello ${acceptanceCustomer.name}, this is a friendly reminder that invoice INV-1042 for ₹84,000 was due on 20 September 2026. Please let us know the expected payment date.`,
      receivedAt: "2026-09-23T05:30:00.000Z",
      processedAt: "2026-09-23T05:30:01.000Z",
    },
    {
      id: "msg-inv-1042-reply",
      companyId: DEMO_COMPANY_ID,
      customerId: acceptanceCustomer.id,
      invoiceId: acceptanceInvoice.id,
      collectionCaseId: acceptanceCase.id,
      channel: "email",
      direction: "inbound",
      externalMessageId: "gmail-demo-inbound-1042",
      subject: "Re: Reminder: INV-1042 is now due",
      body: "We will pay on Tuesday.",
      receivedAt: "2026-09-25T10:25:00.000Z",
      processedAt: "2026-09-25T10:30:00.000Z",
    },
  );

  actions.push({
    id: "action-inv-1042-promise",
    companyId: DEMO_COMPANY_ID,
    collectionCaseId: acceptanceCase.id,
    invoiceId: acceptanceInvoice.id,
    customerId: acceptanceCustomer.id,
    actionType: "follow_up",
    channel: "internal",
    message: "Recorded customer promise to pay ₹84,000 on 29 September 2026. Routine reminders paused.",
    reason: "Inbound email classified as payment_promise with high confidence.",
    dataSnapshot: { sourceMessageId: "msg-inv-1042-reply", promisedDate: "2026-09-29", promisedAmount: 84_000, confidence: 0.96 },
    status: "executed",
    createdBy: "aera",
    executedAt: "2026-09-25T10:30:00.000Z",
    createdAt: "2026-09-25T10:30:00.000Z",
  });

  return {
    companies: [{ id: DEMO_COMPANY_ID, name: "AERA Demo Company", currency: "INR", timezone: "Asia/Kolkata", autonomyMode: "routine_automatic", createdAt: "2025-01-01T00:00:00.000Z" }],
    users: [{ id: "user-demo-manager", companyId: DEMO_COMPANY_ID, name: "Mehul Patel", email: "mehul@aera.example", role: "finance_manager", createdAt: "2025-01-01T00:00:00.000Z" }],
    customers,
    invoices,
    payments,
    cases,
    actions,
    promises,
    communications,
    policies: [defaultPolicy(DEMO_COMPANY_ID)],
    auditEvents: [
      { id: "audit-seed-1042-reminder", companyId: DEMO_COMPANY_ID, actorType: "aera", eventType: "reminder_sent", entityType: "collection_case", entityId: acceptanceCase.id, reason: "Policy step due reached; routine reminder sent", dataSnapshot: { invoiceNumber: "INV-1042", amountOutstanding: 84_000, tone: "friendly" }, createdAt: "2026-09-23T05:30:01.000Z" },
      { id: "audit-seed-1042-promise", companyId: DEMO_COMPANY_ID, actorType: "aera", eventType: "promise_recorded", entityType: "collection_case", entityId: acceptanceCase.id, reason: "Inbound reply classified as payment_promise (confidence 0.96)", dataSnapshot: { promisedDate: "2026-09-29", promisedAmount: 84_000, sourceMessageId: "msg-inv-1042-reply" }, createdAt: "2026-09-25T10:30:00.000Z" },
    ],
  };
}
