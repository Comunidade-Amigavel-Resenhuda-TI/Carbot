require("dotenv").config();

const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder
} = require("discord.js");

const { InferenceClient } = require("@huggingface/inference");
const Database = require("better-sqlite3");

// ========================================
// ⚙️ CONFIGURAÇÃO
// ========================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const hf = new InferenceClient(process.env.HF_TOKEN);

// ========================================
// 🧠 BANCO DE DADOS
// ========================================

const db = new Database("carbot.db");

db.prepare(`
    CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`).run();

// Mantém somente as últimas 10 mensagens por usuário
function saveMemory(userId, role, content) {
    db.prepare(`
        INSERT INTO memories (user_id, role, content)
        VALUES (?, ?, ?)
    `).run(userId, role, content);

    const count = db.prepare(`
        SELECT COUNT(*) AS count
        FROM memories
        WHERE user_id = ?
    `).get(userId).count;

    if (count > 10) {
        db.prepare(`
            DELETE FROM memories
            WHERE user_id = ?
            AND id NOT IN (
                SELECT id
                FROM memories
                WHERE user_id = ?
                ORDER BY id DESC
                LIMIT 10
            )
        `).run(userId, userId);
    }
}

function getMemory(userId) {
    return db.prepare(`
        SELECT role, content
        FROM memories
        WHERE user_id = ?
        ORDER BY id ASC
        LIMIT 10
    `).all(userId);
}

function clearMemory(userId) {
    db.prepare(`
        DELETE FROM memories
        WHERE user_id = ?
    `).run(userId);
}

// ========================================
// 🤖 INTELIGÊNCIA ARTIFICIAL
// ========================================

async function askAI(userId, prompt) {
    saveMemory(userId, "user", prompt);

    const memory = getMemory(userId);

    const response = await hf.chatCompletion({
        model: "openai/gpt-oss-120b:fastest",

        messages: [
            {
                role: "system",
                content: `
Você é o Carbot, um bot brasileiro de Discord.

Responda sempre em português, de forma amigável,
útil e descontraída.

Você pode usar emojis quando fizer sentido.

Seu criador é o longhorn2004 (<@1417274590937223168>).
`
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

    saveMemory(userId, "assistant", answer);

    return answer;
}

// ========================================
// ⚡ COMANDOS
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
        .setDescription("Verifica se o Carbot está online"),

    new SlashCommandBuilder()
        .setName("clear")
        .setDescription("Apaga sua memória de conversa com o Carbot")
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
        console.log("🧠 Memória SQLite carregada!");
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

    if (message.content.toLowerCase() === "ping") {
        return message.reply("🏓 Pong!");
    }

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

    // /ping
    if (interaction.commandName === "ping") {
        return interaction.reply("🏓 Pong!");
    }

    // /clear
    if (interaction.commandName === "clear") {
        clearMemory(interaction.user.id);

        return interaction.reply(
            "🧠 Memória apagada! Começamos do zero."
        );
    }

    // /ask
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