import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { scoreCall } from "./dispo/scorer.js";
import { loadLeads, saveCall } from "./leads/store.js";
import { dialLead, planDials } from "./orchestrator/dialer.js";
import { handleTurn } from "./conversation/turn.js";
import { createSession, startCall } from "./script/stateMachine.js";
import { addToDnc } from "./compliance/dnc.js";

async function simulate() {
  const leads = await loadLeads();
  const lead = leads[0];
  if (!lead) {
    console.error("No leads in data/leads.csv");
    process.exit(1);
  }

  const session = createSession(lead);
  console.log(`\nCalling ${lead.contact_name} · ${lead.company_name} · ${lead.preferred_language}\n`);
  console.log(`Agent: ${startCall(session)}\n`);

  const rl = createInterface({ input: stdin, output: stdout });
  while (!session.ended) {
    const text = await rl.question("You: ");
    const turn = await handleTurn(session, text);
    console.log(`\nAgent (${turn.via}/${turn.route}): ${turn.agent}\n`);
  }
  rl.close();

  const result = await scoreCall(session);
  if (result.compliance_flags.includes("do_not_call_requested")) {
    await addToDnc(lead.contact_number, "requested");
  }
  await saveCall(result);
  console.log("Disposition:", result.disposition);
  console.log("Score:", result.lead_score);
  console.log("Next:", result.next_action);
}

async function dial() {
  const plans = await planDials();
  console.log("Dial plan (Doc 9A orchestrator)\n");
  for (const plan of plans) {
    const mark = plan.skip ? "SKIP" : "DIAL";
    console.log(
      `${mark}  ${plan.lead.contact_name} @ ${plan.lead.company_name}  [${plan.lead.preferred_language} → ${plan.voice.provider}]${plan.reason ? ` — ${plan.reason}` : ""}`,
    );
  }

  const first = plans.find((p) => !p.skip);
  if (!first) {
    console.log("\nNothing to dial.");
    return;
  }
  const result = await dialLead(first.lead);
  console.log("\nFirst eligible lead:", first.lead.contact_name);
  console.log(result);
}

const cmd = process.argv[2];
if (cmd === "sim") await simulate();
else if (cmd === "dial") await dial();
else {
  console.log("Usage: npm run sim | npm run dial | npm run dev");
  process.exit(1);
}
