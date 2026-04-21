CLI is the new API

# History of CLI

CLI, the oldest computer command interface invented in the 1960s, is today the most powerful AI Agent interface.
CLI, or, Command Line Interface, is a text only interface, which Computer users have used for decades. Until GUI, Graphical User Interface, popularized by Apple Macintosh, and Microsoft Windows, redefined the way users interact with computers.

However, CLI remained a powerful interface for Software Engineers, System Administrators as well as Actors playing Hacker Roles in movies. But what makes it so important today in the world of AI Agents?

# Why is CLI so powerful?

AI Agents come in many forms. Coding Agents such as Cursor and Claude code, General purpose Agents such as Claude Cowork and Codex apps, Perplexity Computer and the king of AI Agents, Open Claw.
2026 is the year of AI Agents. It started with the explosion of Open Claw (360K Stars on GitHub). Followed by clawdbot Copyrights drama and OpenAI Acquisition. And now, the focus shifted from Smarter Models to Agents controlling your machine. But what makes Open Claw or any Agent so powerful? It's the ability to run CLI with extreme precision and speed.

# How does it all work?

As Models became smarter and better at reasoning, got larger context window, following prompt instructions accurately and more reliable tool calling.
Long running agents, reasoning, planning, running tools, feedback loops, reasoning again, running tools again, steering towards the goal, until the task is completed.
And what are tools? File Search, it's a CLI. File read and write, it's a CLI. Memory retrieval, it's a CLI. Database queries, it's a CLI. Every AI Agent comes packed with its arsenal of tools. 
The secret of Open Claw design is two ingredients only:
- Communication through Whatsapp, which unlocked messaging power to AI Agents.
- PI Agent, a powerful AI Agent that comes with four CLIs (read, write, edit and bash) and a Skill Creator.
So, You could basically send a message to your agent to run anything on your machine, and if it doesn't know how to do it, it will simply create it and use it.

# CLI vs MCP

So, what about MCP? It's still a great tool, but not as powerful as CLI. LLM Models can compose CLI commands to achieve complex tasks. CLI commands are faster, more precise, token efficient, reliable and steerable with AGENTS.md and Skills.md instructions. MCP servers have their own valid use cases, but CLI is a completely different beast.

# Agent-First Design

CLI already exists, There is a CLI for almost everything. But here is the twist. If you read the bible of CLI Guidelines, its philosophy is: Human-First design. This is now changing. CLI of the future is Agent-First design. When you build any new software, you may need an API, as well as a CLI, for the AI Agents and the Human Users. That's what I learned building Hiro Task Manager, a task manager for people and their AI Agents.

# CLI Design Principles

Building a CLI for my Task Manager, it was horrible in the beginning. I knew I had to find a good reference. I started with CLIG, but that was not enough. I had to learn principles such as Progressive discovery, Newline Delimited JSON, Cardinality exposure, and Context Window discipline. I put together a document to summarize them all.

# Security, and Privacy

One of the trickiest and most complex aspects of using AI Agents is Security. Answering the question: How to give full access to an AI Agent, yet restrict it to do only what you tell it to do? During early development of Hiro Task Manager, I could test it by asking the AI Agent to find a task. First trial, It was denied access because I forgot to give it access to read the task. Second trial, it inspects the code, creates new apis to bypass access control and executes them. It was one of those (many) scary moments, It doesn't take no as an answer. Completing a task means completing it, regardless of the means to do it! 
Building a robust security layer is complex, and you need to acknowledge the limits when they exist. Defining a clear Access Control Policy is important. Hiding your API Keys from your AI Agents is a good practice. I mean really hiding them, like, on a device he doesn't know that it exists. Use encryption, and don't store encryption keys on the same device.

# OS Compatibility

Building a CLI means support for Windows, macOS and Linux. One of the simplest choices is bun/npm, your CLI will work seamlessley across all three platforms. I have used bun for Hiro Task Manager, and it works great so far, tested on Windows 10, 11, macOS 12+, and Centos. I didn't face compatibility issues so far.

# How Agents Learn to use the CLI

If you built a perfect CLI, following all the guidelines, you may walk away with writing a simple prompt to give it hint to run the CLI. But you don't need that. You simply need to create a skill document for that skill. It doesn't have to be a huge file. The smaller the better. You can also use compression techniques to put everything you know in the smallest possible file, not hurting the token count!

On top of that, you don't even need to ask the user to keep copying the skill file(s) in every project, every AI Agent, there is a much better way. npx skills!

Finally, Online Docs, for your Agent and for your Users. One of the most effective ways is using Mintlify. It is used by Anthropic, OpenAI, Langchain and many more. It helps you build your docs, connect them to your CLI, to your skills, and to your code, so the AI Agent can even help you write the docs!

# References

