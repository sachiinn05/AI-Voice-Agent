# AI Call Agent

A voice AI that **calls, talks, and books a meeting** — like a junior sales person who never sleeps.

You press Call. The agent speaks. You say “okay” or “I’m busy.” It answers, then books 15 minutes on [Calendly](https://calendly.com/sachinsingh6386/30min).

## Interview story (say this)

**One line**

> I built a voice agent that can hold a real phone-style conversation and book a meeting, not a chatbot you type into.

**45 seconds**

> Companies miss calls — a hospital at night, a shop when someone asks “where is my order.” I built an AI that can *talk*, not just chat. It greets you, explains the problem in simple words, handles “not interested” or “how much,” and books a slot on my Calendly. The demo ships 3 voice agents (Hinglish, Indian English, US English) and 24 fake leads across hospitals, grocery apps, clinics, gyms, law firms and more — pick an agent, pick a lead, call. I used a state machine so the spoken lines stay locked, Groq only to understand what the person said, and speech in/out in the browser so I can demo it without buying a phone number.

**If they ask “what did you actually code?”**

> The call brain (who speaks next), voice in and voice out, Groq for intent only so the agent does not invent lines, a do-not-call list, and post-call notes — booked / not interested / call back.

**If they ask about Nimbus / NBFC**

> That was old demo jargon. I replaced it. The story is now hospital, grocery orders, and a clinic. Anyone in the room can follow it.

## Demo agents & leads

Three agents, one script, one brain each — only the voice and language differ:

| Agent | Language | Voice |
|---|---|---|
| Hinglish Agent | `hi-IN-hinglish` | Sarvam Bulbul |
| Indian English Agent | `en-IN` | Sarvam Bulbul |
| US English Agent | `en-US` | Edge / ElevenLabs |

[`data/leads.csv`](data/leads.csv) ships 24 leads (8 per agent, mixed gender) across hospitals, grocery/pharmacy delivery, dental clinics, salons, gyms, auto shops, law firms, real estate, insurance and more — enough variety that back-to-back demo calls don't feel like the same call twice. Add your own rows any time; `gender` (`male`/`female`) only affects Hindi grammar agreement, everything else personalizes automatically from `industry` / `company_description` / `need_for_bot`.

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Pick an **agent**, pick a **lead**, click **Start call**, say **okay** twice, then pick a time.

## How it works

1. **One script file** — [`scripts/call-script.yaml`](scripts/call-script.yaml) is the only thing the agent can say: the five beats of the call and every objection comeback. It's validated at startup, so a typo fails loudly instead of mid-call. Edit the YAML to change the call — no code.
2. **State machine** — opening → discovery → pitch → close → wrap-up. Not free-form chat; every beat ends on a question and the agent waits.
3. **Groq** — understands what the caller *meant* (intent), and can say a script line more naturally. It never decides *what* to say, and every fact stays locked to the file.
4. **Questions mid-call — real RAG over a PDF** — [`knowledge/*.pdf`](knowledge/) is chunked with a token-aware splitter (`js-tiktoken`, cl100k_base) and embedded with Gemini (`gemini-embedding-001`, free tier) into a local vector index (`data/rag-index.json`, cosine search — no server, see [`src/rag/`](src/rag/)). A caller's question is embedded the same way, matched against the index, and Groq writes the spoken answer grounded strictly in the retrieved chunks. Below the confidence floor, or if Groq can't ground an answer in the chunks, it says so → "I won't guess, that's what the demo covers." Run `npm run ingest` after changing the PDF.
5. **Voice** — browser mic in; Sarvam Bulbul (native Hinglish) or free Edge neural voices out. Backchannels ("haan, samajh gaya…") are pre-recorded and play instantly while the real reply generates. Real phone calls via Vapi when keys are set.
6. **After the call** — transcript, score, next action, and every question asked (with which PDF chunk answered it via RAG — or that none did, which is the list to grow the PDF from).

## Edit the script

Everything the agent's *scripted* lines say is in [`scripts/call-script.yaml`](scripts/call-script.yaml), written top to bottom like the call itself. Placeholders like `{name}`, `{company}`, `{calls}` fill in per lead; `topics:` maps a lead's industry to the story it hears. To teach it a new open-ended answer (pricing, features, company facts), add it to the PDF in `knowledge/` and run `npm run ingest` — see "PDF-backed RAG" below.

```bash
npm test          # includes one test that renders every line in every language
npm run voices    # list the free Edge voices; -- --sample renders A/B clips
npm run ingest    # (re)build the PDF vector index — needs GEMINI_API_KEY
```

## PDF-backed RAG

Everything the agent *must* say (opening, pitch, close, objections) still comes from [`scripts/call-script.yaml`](scripts/call-script.yaml). But an open-ended question mid-call — "do you support Hindi?", "is my data safe?" — is now answered by real retrieval-augmented generation over a PDF instead of a hand-written FAQ list:

1. Drop a PDF in [`knowledge/`](knowledge/) (gitignored — bring your own; `RAG_PDF_PATH` in `.env` points at it).
2. `npm run ingest` — extracts the text ([`src/rag/pdf.ts`](src/rag/pdf.ts)), splits it into overlapping ~300-token chunks with a real BPE tokenizer ([`src/rag/chunk.ts`](src/rag/chunk.ts)), embeds each chunk with OpenAI ([`src/rag/embeddings.ts`](src/rag/embeddings.ts)), and writes a local vector index to `data/rag-index.json` ([`src/rag/store.ts`](src/rag/store.ts)).
3. On a call, a caller's question is embedded the same way, matched against the index by cosine similarity, and Groq is asked to answer using **only** the retrieved chunks ([`src/rag/answer.ts`](src/rag/answer.ts)) — never inventing a fact, same guarantee the old scripted FAQ gave.

No `GEMINI_API_KEY` / no index yet → the agent gives the honest "I don't know, here's what I can show you" pivot instead of guessing.

## Frontend

The UI is React + TypeScript + Tailwind, source in [`web/`](web/), built with Vite straight into `public/` — the Express server (`src/server.ts`) just does `express.static("public")` and needs no changes either way.

```bash
npm run web:install   # once, installs web/'s own deps
npm run web:build     # rebuild public/ after changing anything in web/src
npm run web:dev       # Vite dev server with hot reload, proxies /api to the backend on :3000
```

`npm run dev` (the backend) always serves whatever is currently built into `public/` — run `web:build` after editing the frontend, or use `web:dev` alongside the backend while actively working on UI. The delicate mic/speech-recognition/TTS logic lives in [`web/src/lib/voice.js`](web/src/lib/voice.js), framework-agnostic on purpose.

## Resume bullet

`Built a voice AI agent that runs a live outbound conversation (speech in/out), handles objections, and books meetings on Calendly; Groq + a call state machine, demoable in the browser.`
