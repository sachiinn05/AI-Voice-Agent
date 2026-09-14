import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const PDFDocument = require("pdfkit") as typeof import("pdfkit");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "knowledge");

type Section = { title: string; body: string[] };

function writePdf(fileName: string, title: string, subtitle: string, sections: Section[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 56,
      info: { Title: title, Author: "Aarohi Connect", Subject: subtitle },
    });
    const dest = path.join(outDir, fileName);
    const stream = createWriteStream(dest);
    doc.pipe(stream);

    doc.fillColor("#0f766e").fontSize(11).text("AAROHI CONNECT");
    doc.moveDown(0.3);
    doc.fillColor("#101828").fontSize(22).text(title);
    doc.moveDown(0.2);
    doc.fontSize(11).fillColor("#475467").text(subtitle);
    doc.moveDown(1);

    for (const section of sections) {
      doc.fillColor("#0f766e").fontSize(14).text(section.title);
      doc.moveDown(0.35);
      doc.fillColor("#1d2939").fontSize(11);
      for (const para of section.body) {
        doc.text(para, { align: "left", lineGap: 3 });
        doc.moveDown(0.55);
      }
      doc.moveDown(0.25);
    }

    doc.end();
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
}

const profile: Section[] = [
  {
    title: "About the company",
    body: [
      "Aarohi Connect is a Bengaluru-based company that builds AI voice receptionists for clinics, hospitals, grocery apps, and local service businesses. The company was founded in 2023 by Meera Iyer and Kabir Shah. The head office is at 4th Floor, Indiranagar Tech Park, 12th Main, Bengaluru 560038. Support hours are Monday to Saturday, 9:00 AM to 8:00 PM IST. The official website is www.aarohiconnect.example and the support email is hello@aarohiconnect.example.",
      "Aarohi Connect does not replace doctors, delivery riders, or clinic staff. The product answers the phone when a human is busy, understands a simple request, and either books a slot or forwards the call. Every customer is assigned one account manager. There is only one company on this platform. The AI agent always represents Aarohi Connect and never pretends to be a hospital or a grocery brand.",
    ],
  },
  {
    title: "Who we serve",
    body: [
      "The main customers are night-duty hospitals, dental clinics, diagnostic labs, and grocery delivery apps that get repetitive calls. A typical hospital uses Aarohi Connect because patients call after 10 PM and the front desk is empty. A typical grocery app uses it because shoppers keep asking where their order is. A typical clinic uses it because the appointment line stays busy in the afternoon.",
      "We currently operate in India and the United Arab Emirates. We do not sell to government emergency numbers, banks, or insurance claim desks. We do not handle payments on the call. We do not give medical advice, legal advice, or loan offers.",
    ],
  },
  {
    title: "Contact and legal",
    body: [
      "Sales phone: +91 80 4567 2100. WhatsApp business: +91 98765 44110. GSTIN for the demo company is 29AAROHI1234C1Z5. Cancellation and refunds follow the pricing document. Aarohi Connect is a dummy company created only for product demos. Prices, policies, and names in these PDFs are fictional and should be treated as the source of truth for the voice agent.",
    ],
  },
];

const products: Section[] = [
  {
    title: "Voice Receptionist",
    body: [
      "Voice Receptionist is the core product. It picks up missed calls, greets the caller in Indian English, US English, or Hinglish, and follows a short script. It can book a 15-minute demo, capture a callback time, or transfer to a human. It discloses that it is an AI in the first sentence. It never invents a doctor name, a delivery status, or a medicine.",
    ],
  },
  {
    title: "After-hours Desk",
    body: [
      "After-hours Desk is for hospitals and clinics that close at night. Between 8:00 PM and 8:00 AM IST the agent answers, records the reason for the call, and sends a summary to the duty phone. It can confirm that the clinic is closed. It cannot prescribe, confirm test results, or say a doctor is available if the calendar is empty.",
    ],
  },
  {
    title: "Order Status Line",
    body: [
      "Order Status Line is for grocery and pharmacy apps. Callers can ask for an estimated arrival window. The agent only reads the status that the merchant system provides: packed, out for delivery, delayed, or delivered. If the system has no status, the agent says it does not have enough information and offers a human callback. It does not invent a rider location.",
    ],
  },
  {
    title: "What we do not offer",
    body: [
      "Aarohi Connect does not offer SMS marketing blasts, unpaid lead scraping, or robocalls to people who opted out. We do not store patient health records. We do not sell a white-label marketplace. Add-ons that exist today are only call recording export and a weekly summary email. WhatsApp chatbots are on the roadmap and are not sold yet.",
    ],
  },
];

const pricing: Section[] = [
  {
    title: "How pricing works",
    body: [
      "Pricing depends on monthly connected-call volume and which product the customer uses. All prices below are in Indian Rupees and exclude 18% GST. A connected call is a call that lasts more than 10 seconds. There is no per-minute surprise fee on the listed plans. Setup is included. A Calendly-style booking link is included on every paid plan.",
    ],
  },
  {
    title: "Starter plan",
    body: [
      "Starter costs 8,999 rupees per month. It includes 1,000 connected calls, one phone number, one language, and email support on weekdays. Extra calls are 9 rupees each. Starter is meant for a single clinic or a small shop. It does not include after-hours hospital routing.",
    ],
  },
  {
    title: "Growth plan",
    body: [
      "Growth costs 19,999 rupees per month. It includes 4,000 connected calls, two languages, After-hours Desk, and a dedicated WhatsApp number for callbacks. Extra calls are 7 rupees each. Most grocery apps and multi-doctor clinics start here.",
    ],
  },
  {
    title: "Premium plan",
    body: [
      "Premium costs 39,999 rupees per month. It includes 10,000 connected calls, three languages, Order Status Line, a named account manager, and same-day callback for outages. Extra calls are 5 rupees each. Custom hospital integrations are quoted separately and start at 75,000 rupees one time. Annual billing gets one month free. There is no hidden discount unless a written quote from sales says so.",
    ],
  },
  {
    title: "Refunds and trials",
    body: [
      "New customers get a 7-day trial with up to 100 connected calls. The trial is free. If the customer cancels in writing within 7 days of first payment, Aarohi Connect refunds the first month in full within 10 business days. After 7 days, monthly fees are not refunded. Unused call credits do not roll over. Customers on the do-not-call list are never billed for retries.",
    ],
  },
];

const faq: Section[] = [
  {
    title: "Is the agent a real person?",
    body: [
      "No. The caller is speaking to Aarohi Connect's AI voice assistant. The opening line always says this. A human account manager can join only if the caller asks to be transferred and a teammate is available during support hours.",
    ],
  },
  {
    title: "What languages do you support?",
    body: [
      "The live product supports Indian English, US English, and Hinglish. The language is chosen before the call starts and does not switch in the middle of a call. Kannada and Tamil are not available yet.",
    ],
  },
  {
    title: "Can it book a doctor visit by itself?",
    body: [
      "It can book a 15-minute product demo with Aarohi Connect. It can also offer two spoken time slots and lock one if the caller accepts. It cannot book a hospital OT, a surgery, or a lab test unless a later integration is written in a custom contract. Dummy company rule: if this FAQ does not mention a booking type, the agent must say it does not have enough information.",
    ],
  },
  {
    title: "What is the refund policy?",
    body: [
      "A full refund is available only in the first 7 days after the first payment. After that, the month is non-refundable. Details are in the pricing document. The agent must not invent a longer refund window or a cash discount.",
    ],
  },
  {
    title: "Do you call people on the DNC list?",
    body: [
      "No. If a person says do not call, stop calling, or opt out, the number is added to the suppression list and is not dialed again. Harassment, legal threats, or scam accusations end the call immediately.",
    ],
  },
  {
    title: "Where are you located and when are you open?",
    body: [
      "Head office: Indiranagar Tech Park, Bengaluru. Support is 9:00 AM to 8:00 PM IST, Monday to Saturday. Sundays are closed except for Premium outage callbacks. There is no 24x7 human desk on Starter or Growth.",
    ],
  },
];

await mkdir(outDir, { recursive: true });
await writePdf("company-profile.pdf", "Company profile", "Dummy company knowledge for the voice agent demo", profile);
await writePdf("products.pdf", "Products and services", "What Aarohi Connect sells and what it does not sell", products);
await writePdf("pricing.pdf", "Pricing", "Official plan prices, extra-call rates, and refunds", pricing);
await writePdf("faq.pdf", "Frequently asked questions", "Short answers the voice agent may read from", faq);
console.log(`Wrote 4 PDFs to ${outDir}`);
