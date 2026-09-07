require("dotenv").config();

const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder
} = require("discord.js");

const { InferenceClient } = require("@huggingface/inference");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const hf = new InferenceClient(process.env.HF_TOKEN);

// ========================================
// 🧠 MEMÓRIA
// ========================================

const memories = new Map();

function getMemory(userId) {
    if (!memories.has(userId)) {
        memories.set(userId, []);
    }

    return memories.get(userId);
}

function addToMemory(userId, role, content) {
    const memory = getMemory(userId);

    memory.push({
        role,
        content
    });

    // Mantém somente as últimas 10 mensagens
    if (memory.length > 10) {
        memory.shift();
    }
}

// ========================================
// 🤖 IA
// ========================================

async function askAI(userId, prompt) {
    const memory = getMemory(userId);

    addToMemory(userId, "user", prompt);

    const response = await hf.chatCompletion({
        model: "openai/gpt-oss-120b:fastest",

        messages: [
            {
                role: "system",
                content:
                    "Você é o Carbot, um bot brasileiro de Discord. " +
                    "Responda sempre em português, de forma amigável, útil e descontraída. " +
                    "Você pode usar emojis quando fizer sentido." +
                    "O seu criador é o longhorn2004 (<@1417274590937223168>)"
            },

            ...memory
        ],

        max_tokens: 500,
        temperature: 0.7
    });

    const answer =
        response.choices?.[0]?.message?.content;

    if (!answer) {
        throw new Error("A IA não retornou uma resposta.");
    }

    addToMemory(userId, "assistant", answer);

    return answer;
}

// ========================================
// ⚙️ SLASH COMMANDS
// ========================================

const commands = [
    new SlashCommandBuilder()
        .setName("ask")
        .setDescription("Faça uma pergunta para o Carbot")
        .addStringOption(option =>
            option
                .setName("pergunta")
                .setDescription("O que você quer perguntar?")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Verifica se o Carbot está online")
].map(command => command.toJSON());

// ========================================
// 🚀 BOT ONLINE
// ========================================

client.once("ready", async () => {
    console.log(`🤖 Carbot online como ${client.user.tag}`);

    try {
        const rest = new REST({ version: "10" })
            .setToken(process.env.DISCORD_TOKEN);

        await rest.put(
            Routes.applicationCommands(client.user.id),
            {
                body: commands
            }
        );

        console.log("✅ Comandos slash registrados!");
    } catch (error) {
        console.error(
            "❌ Erro ao registrar comandos:",
            error
        );
    }
});

// ========================================
// 💬 MENSAGENS
// ========================================

client.on("messageCreate", async message => {
    if (message.author.bot) return;

    // Ping tradicional
    if (message.content.toLowerCase() === "ping") {
        return message.reply("🏓 Pong!");
    }

    // Só responde quando for mencionado
    if (!message.mentions.has(client.user)) return;

    const prompt = message.content
        .replace(`<@${client.user.id}>`, "")
        .replace(`<@!${client.user.id}>`, "")
        .trim();

    if (!prompt) {
        return message.reply(
            "🤖 Fala aí! O que você quer saber?"
        );
    }

    try {
        await message.channel.sendTyping();

        const answer = await askAI(
            message.author.id,
            prompt
        );

        await message.reply(answer);

    } catch (error) {
        console.error("❌ Erro na IA:", error);

        await message.reply(
            "❌ Deu erro ao falar com a inteligência artificial."
        );
    }
});

// ========================================
// ⚡ INTERAÇÕES
// ========================================

client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "ping") {
        return interaction.reply("🏓 Pong!");
    }

    if (interaction.commandName === "ask") {
        const prompt =
            interaction.options.getString("pergunta");

        await interaction.deferReply();

        try {
            const answer = await askAI(
                interaction.user.id,
                prompt
            );

            await interaction.editReply(answer);

        } catch (error) {
            console.error("❌ Erro na IA:", error);

            await interaction.editReply(
                "❌ Deu erro ao falar com a inteligência artificial."
            );
        }
    }
});

// ========================================
// 🔑 LOGIN
// ========================================

client.login(process.env.DISCORD_TOKEN);