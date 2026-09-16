# AI Call Agent

A voice AI that **calls, talks, and books a meeting** — like a junior sales person who never sleeps.

You press Call. The agent speaks. You say “okay” or “I’m busy.” It answers, then books 15 minutes on [Calendly](https://calendly.com/sachinsingh6386/30min).

## Interview story (say this)

**One line**

> I built a voice agent that can hold a real phone-style conversation and book a meeting, not a chatbot you type into.

**45 seconds**

> Companies miss calls — a hospital at night, a shop when someone asks “where is my order.” I built an AI that can *talk*, not just chat. It greets you, explains the problem in simple words, handles “not interested” or “how much,” and books a slot on my Calendly. The demo is three fake people: a hospital front desk, a grocery app, and a dental clinic. I used a state machine so the spoken lines stay locked, Groq only to understand what the person said, and speech in/out in the browser so I can demo it without buying a phone number.

**If they ask “what did you actually code?”**

> The call brain (who speaks next), voice in and voice out, Groq for intent only so the agent does not invent lines, a do-not-call list, and post-call notes — booked / not interested / call back.

**If they ask about Nimbus / NBFC**

> That was old demo jargon. I replaced it. The story is now hospital, grocery orders, and a clinic. Anyone in the room can follow it.

## Demo contacts

| Who | Easy story | Language |
|---|---|---|
| Ananya · CityCare Hospital | Night patient calls, nobody picks up | Hinglish |
| Rohan · FreshBasket | “Where is my order?” calls | Indian English |
| Emily · BrightSmile Clinic | Appointment line always busy | US English |

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Pick **Ananya**, click **Call**, say **okay** twice, then pick a time.

## How it works

1. **One script file** — [`scripts/call-script.yaml`](scripts/call-script.yaml) is the only thing the agent can say: the five beats of the call, every objection comeback, and an FAQ. It's validated at startup, so a typo fails loudly instead of mid-call. Edit the YAML to change the call — no code.
2. **State machine** — opening → discovery → pitch → close → wrap-up. Not free-form chat; every beat ends on a question and the agent waits.
3. **Groq** — understands what the caller *meant* (intent), and can say a script line more naturally. It never decides *what* to say, and every fact stays locked to the file.
4. **Questions mid-call** — matched against the script's FAQ (local embeddings + keywords, no database). A hit is spoken word-for-word and the call resumes its beat; no hit → "I won't guess, that's what the demo covers." Groq only breaks ties between close candidates.
5. **Voice** — browser mic in; Sarvam Bulbul (native Hinglish) or free Edge neural voices out. Backchannels ("haan, samajh gaya…") are pre-recorded and play instantly while the real reply generates. Real phone calls via Vapi when keys are set.
6. **After the call** — transcript, score, next action, and every question asked (with which FAQ entry answered it — or that none did, which is the list to grow the script from).

## Edit the script

Everything the agent says is in [`scripts/call-script.yaml`](scripts/call-script.yaml), written top to bottom like the call itself. Placeholders like `{name}`, `{company}`, `{calls}` fill in per lead; `topics:` maps a lead's industry to the story it hears. Add a question callers keep asking to `faq:` with a few `ask:` phrasings and it starts working on restart.

```bash
npm test          # 88 tests, including one that renders every line in every language
npm run voices    # list the free Edge voices; -- --sample renders A/B clips
```

## Resume bullet

`Built a voice AI agent that runs a live outbound conversation (speech in/out), handles objections, and books meetings on Calendly; Groq + a call state machine, demoable in the browser.`
