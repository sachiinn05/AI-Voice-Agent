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

1. **State machine** — opening → problem → short pitch → objections → book. Not free-form chat.
2. **Groq** — classifies what the caller meant. The app then speaks a controlled script line.
3. **Browser voice** — you talk, it talks. Real phone numbers are optional later (Vapi).
4. **Calendly** — booked meetings use `https://calendly.com/sachinsingh6386/30min`.
5. **After the call** — transcript, score, next action.

## Resume bullet

`Built a voice AI agent that runs a live outbound conversation (speech in/out), handles objections, and books meetings on Calendly; Groq + a call state machine, demoable in the browser.`
