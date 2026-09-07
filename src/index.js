// ========================================
// 🤖 CARBOT 1.2.1
// Compatível com Wispbyte
// ========================================

require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");

const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder
} = require("discord.js");

const { InferenceClient } = require("@huggingface/inference");

const {
    splitMessage,
    getAIErrorMessage,
    normalizeHFError,
    defaultPersonality
} = require("./utils");

// ========================================
// ⚙️ CONFIGURAÇÕES
// ========================================

const MODEL =
    process.env.HF_MODEL ||
    "openai/gpt-oss-120b:fastest";

const MAX_MEMORY = 10;

// ========================================
// 💾 BANCO JSON
// ========================================

const dataDir = path.join(__dirname, "..", "data");
const dataFile = path.join(dataDir, "carbot.json");

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(
        dataFile,
        JSON.stringify({
            memories: {},
            guilds: {}
        }, null, 2)
    );
}

function loadData() {
    try {
        const content = fs.readFileSync(dataFile, "utf8");

        const data = JSON.parse(content);

        if (!data.memories) {
            data.memories = {};
        }

        if (!data.guilds) {
            data.guilds = {};
        }

        return data;
    } catch (error) {
        console.error("❌ Erro ao ler carbot.json:", error);

        return {
            memories: {},
            guilds: {}
        };
    }
}

let db = loadData();

function saveData() {
    try {
        fs.writeFileSync(
            dataFile,
            JSON.stringify(db, null, 2)
        );
    } catch (error) {
        console.error("❌ Erro ao salvar carbot.json:", error);
    }
}

// ========================================
// 🧠 MEMÓRIA
// ========================================

function getMemory(guildId, userId) {
    const key = `${guildId}:${userId}`;

    return db.memories[key] || [];
}

function saveMemory(guildId, userId, role, content) {
    const key = `${guildId}:${userId}`;

    if (!db.memories[key]) {
        db.memories[key] = [];
    }

    db.memories[key].push({
        role,
        content,
        created_at: new Date().toISOString()
    });

    if (db.memories[key].length > MAX_MEMORY) {
        db.memories[key] =
            db.memories[key].slice(-MAX_MEMORY);
    }

    saveData();
}

function clearMemory(guildId, userId) {
    const key = `${guildId}:${userId}`;

    delete db.memories[key];

    saveData();
}

// ========================================
// 🏠 CONFIGURAÇÃO DO SERVIDOR
// ========================================

function getPersonality(guildId) {
    return (
        db.guilds[guildId]?.personality ||
        defaultPersonality()
    );
}

function setPersonality(guildId, personality) {
    if (!db.guilds[guildId]) {
        db.guilds[guildId] = {};
    }

    db.guilds[guildId].personality = personality;

    saveData();
}

function resetPersonality(guildId) {
    if (db.guilds[guildId]) {
        delete db.guilds[guildId].personality;
    }

    saveData();
}

// ========================================
// 🤖 CLIENTE DO DISCORD
// ========================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const hf = new InferenceClient(
    process.env.HF_TOKEN
);

// ========================================
// 🧠 IA
// ========================================

async function askAI(guildId, userId, prompt) {
    const memory = getMemory(guildId, userId);

    const messages = [
        {
            role: "system",
            content: getPersonality(guildId)
        }
    ];

    for (const item of memory) {
        messages.push({
            role: item.role,
            content: item.content
        });
    }

    messages.push({
        role: "user",
        content: prompt
    });

    try {
        const response = await hf.chatCompletion({
            model: MODEL,
            messages,
            max_tokens: 1000,
            temperature: 0.7
        });

        const answer =
            response?.choices?.[0]?.message?.content;

        if (!answer) {
            throw new Error("HF_UNKNOWN");
        }

        // Só salva depois que a IA respondeu
        saveMemory(
            guildId,
            userId,
            "user",
            prompt
        );

        saveMemory(
            guildId,
            userId,
            "assistant",
            answer
        );

        return answer;

    } catch (error) {
        console.error("❌ Erro Hugging Face:", error);

        throw normalizeHFError(error);
    }
}

// ========================================
// 📦 EMBEDS
// ========================================

function createAIEmbed(content, index, total) {
    const embed = new EmbedBuilder()
        .setColor(0x3498db)
        .setDescription(content)
        .setFooter({
            text:
                total > 1
                    ? `Carbot • Parte ${index}/${total}`
                    : "Carbot"
        })
        .setTimestamp();

    return embed;
}

async function sendAIResponse(message, answer) {
    const chunks = splitMessage(answer, 3900);

    for (let i = 0; i < chunks.length; i++) {
        await message.channel.send({
            embeds: [
                createAIEmbed(
                    chunks[i],
                    i + 1,
                    chunks.length
                )
            ]
        });
    }
}

async function replyAIInteraction(interaction, answer) {
    const chunks = splitMessage(answer, 3900);

    await interaction.editReply({
        embeds: [
            createAIEmbed(
                chunks[0],
                1,
                chunks.length
            )
        ]
    });

    for (let i = 1; i < chunks.length; i++) {
        await interaction.followUp({
            embeds: [
                createAIEmbed(
                    chunks[i],
                    i + 1,
                    chunks.length
                )
            ]
        });
    }
}

// ========================================
// 📋 SLASH COMMANDS
// ========================================

const commands = [
    new SlashCommandBuilder()
        .setName("ask")
        .setDescription("Faça uma pergunta para o Carbot")
        .addStringOption(option =>
            option
                .setName("pergunta")
                .setDescription("Sua pergunta")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Verifica se o Carbot está online"),

    new SlashCommandBuilder()
        .setName("clear")
        .setDescription("Limpa sua memória com o Carbot"),

    new SlashCommandBuilder()
        .setName("setpersonality")
        .setDescription("Define a personalidade do Carbot neste servidor")
        .addStringOption(option =>
            option
                .setName("personalidade")
                .setDescription("Nova personalidade")
                .setRequired(true)
                .setMaxLength(1500)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.Administrator
        ),

    new SlashCommandBuilder()
        .setName("resetpersonality")
        .setDescription("Restaura a personalidade padrão")
        .setDefaultMemberPermissions(
            PermissionFlagsBits.Administrator
        ),

    new SlashCommandBuilder()
        .setName("config")
        .setDescription("Mostra a configuração do Carbot")
].map(command => command.toJSON());

// ========================================
// 🟢 READY
// ========================================

client.once("ready", async () => {
    console.log("========================================");
    console.log(`🤖 Carbot online como ${client.user.tag}`);
    console.log(`🧠 Modelo: ${MODEL}`);
    console.log(`💾 Banco: carbot.json`);
    console.log("========================================");

    try {
        const rest = new REST({
            version: "10"
        }).setToken(process.env.DISCORD_TOKEN);

        await rest.put(
            Routes.applicationCommands(client.user.id),
            {
                body: commands
            }
        );

        console.log("✅ Slash commands registrados!");
    } catch (error) {
        console.error(
            "❌ Erro ao registrar slash commands:",
            error
        );
    }
});

// ========================================
// 💬 MENSAGENS
// ========================================

client.on("messageCreate", async message => {
    if (message.author.bot) return;

    if (message.content.trim().toLowerCase() === "ping") {
        await message.reply("🏓 Pong!");
        return;
    }

    if (!message.mentions.has(client.user)) {
        return;
    }

    if (!message.guild) {
        return;
    }

    const prompt = message.content
        .replace(`<@${client.user.id}>`, "")
        .replace(`<@!${client.user.id}>`, "")
        .trim();

    if (!prompt) {
        await message.reply(
            "👋 Opa! Me pergunta alguma coisa!"
        );
        return;
    }

    try {
        await message.channel.sendTyping();

        const answer = await askAI(
            message.guild.id,
            message.author.id,
            prompt
        );

        await sendAIResponse(
            message,
            answer
        );

    } catch (error) {
        console.error(error);

        await message.reply(
            getAIErrorMessage(error)
        );
    }
});

// ========================================
// ⚡ INTERAÇÕES
// ========================================

client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) {
        return;
    }

    // ------------------------------------
    // /ping
    // ------------------------------------

    if (interaction.commandName === "ping") {
        await interaction.reply("🏓 Pong!");
        return;
    }

    // ------------------------------------
    // /clear
    // ------------------------------------

    if (interaction.commandName === "clear") {
        if (!interaction.guild) {
            await interaction.reply({
                content:
                    "❌ Esse comando só funciona em servidores.",
                ephemeral: true
            });

            return;
        }

        clearMemory(
            interaction.guild.id,
            interaction.user.id
        );

        await interaction.reply({
            content:
                "🧹 Sua memória com o Carbot foi limpa!",
            ephemeral: true
        });

        return;
    }

    // ------------------------------------
    // /setpersonality
    // ------------------------------------

    if (
        interaction.commandName ===
        "setpersonality"
    ) {
        if (!interaction.guild) {
            await interaction.reply({
                content:
                    "❌ Esse comando só funciona em servidores.",
                ephemeral: true
            });

            return;
        }

        if (
            !interaction.memberPermissions?.has(
                PermissionFlagsBits.Administrator
            )
        ) {
            await interaction.reply({
                content:
                    "🚫 Você precisa ser administrador para fazer isso.",
                ephemeral: true
            });

            return;
        }

        const personality =
            interaction.options.getString(
                "personalidade",
                true
            );

        setPersonality(
            interaction.guild.id,
            personality
        );

        await interaction.reply({
            content:
                "✅ Personalidade do Carbot atualizada neste servidor!",
            ephemeral: true
        });

        return;
    }

    // ------------------------------------
    // /resetpersonality
    // ------------------------------------

    if (
        interaction.commandName ===
        "resetpersonality"
    ) {
        if (!interaction.guild) {
            await interaction.reply({
                content:
                    "❌ Esse comando só funciona em servidores.",
                ephemeral: true
            });

            return;
        }

        if (
            !interaction.memberPermissions?.has(
                PermissionFlagsBits.Administrator
            )
        ) {
            await interaction.reply({
                content:
                    "🚫 Você precisa ser administrador para fazer isso.",
                ephemeral: true
            });

            return;
        }

        resetPersonality(
            interaction.guild.id
        );

        await interaction.reply({
            content:
                "🔄 Personalidade padrão restaurada!",
            ephemeral: true
        });

        return;
    }

    // ------------------------------------
    // /config
    // ------------------------------------

    if (interaction.commandName === "config") {
        if (!interaction.guild) {
            await interaction.reply({
                content:
                    "❌ Esse comando só funciona em servidores.",
                ephemeral: true
            });

            return;
        }

        const customPersonality =
            db.guilds[interaction.guild.id]
                ?.personality;

        const embed = new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle("⚙️ Configuração do Carbot")
            .addFields(
                {
                    name: "🧠 Modelo",
                    value: `\`${MODEL}\``
                },
                {
                    name: "💭 Memória",
                    value: `${MAX_MEMORY} mensagens por usuário`
                },
                {
                    name: "🎭 Personalidade",
                    value: customPersonality
                        ? "Personalidade personalizada"
                        : "Personalidade padrão"
                }
            )
            .setFooter({
                text: "Carbot 1.2.1"
            });

        await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });

        return;
    }

    // ------------------------------------
    // /ask
    // ------------------------------------

    if (interaction.commandName === "ask") {
        if (!interaction.guild) {
            await interaction.reply({
                content:
                    "❌ Esse comando só funciona em servidores.",
                ephemeral: true
            });

            return;
        }

        const prompt =
            interaction.options.getString(
                "pergunta",
                true
            );

        try {
            await interaction.deferReply();

            const answer = await askAI(
                interaction.guild.id,
                interaction.user.id,
                prompt
            );

            await replyAIInteraction(
                interaction,
                answer
            );

        } catch (error) {
            console.error(error);

            await interaction.editReply(
                getAIErrorMessage(error)
            );
        }
    }
});

// ========================================
// 🔐 VERIFICAÇÃO
// ========================================

if (!process.env.DISCORD_TOKEN) {
    console.error(
        "❌ DISCORD_TOKEN não foi configurado!"
    );

    process.exit(1);
}

if (!process.env.HF_TOKEN) {
    console.error(
        "❌ HF_TOKEN não foi configurado!"
    );

    process.exit(1);
}

// ========================================
// 🚀 LOGIN
// ========================================

client.login(
    process.env.DISCORD_TOKEN
);