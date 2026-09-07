const test = require("node:test");
const assert = require("node:assert/strict");

const {
    splitMessage,
    getAIErrorMessage,
    normalizeHFError,
    defaultPersonality
} = require("../src/utils");

// ========================================
// ✂️ splitMessage
// ========================================

test("splitMessage não altera mensagens pequenas", () => {

    const result =
        splitMessage("Olá mundo!");

    assert.deepEqual(
        result,
        ["Olá mundo!"]
    );
});

test("splitMessage divide mensagens grandes", () => {

    const text =
        "a".repeat(5000);

    const result =
        splitMessage(text, 2000);

    assert.equal(
        result.length,
        3
    );

    assert.ok(
        result.every(
            chunk => chunk.length <= 2000
        )
    );
});

test("splitMessage tenta dividir em espaços", () => {

    const text =
        "abc ".repeat(1000);

    const result =
        splitMessage(text, 2000);

    assert.ok(
        result.length > 1
    );

    assert.ok(
        result.every(
            chunk => chunk.length <= 2000
        )
    );
});

// ========================================
// 🤖 ERROS DA IA
// ========================================

test("HF_AUTH gera mensagem correta", () => {

    const error =
        new Error("HF_AUTH");

    assert.equal(
        getAIErrorMessage(error),
        "🔐 O token da IA está inválido ou expirou."
    );
});

test("HF_RATE_LIMIT gera mensagem correta", () => {

    const error =
        new Error("HF_RATE_LIMIT");

    assert.equal(
        getAIErrorMessage(error),
        "⏳ A IA está recebendo muitas requisições. Tenta novamente daqui a pouco."
    );
});

test("HF_MODEL_NOT_FOUND gera mensagem correta", () => {

    const error =
        new Error("HF_MODEL_NOT_FOUND");

    assert.equal(
        getAIErrorMessage(error),
        "🤖 O modelo de IA configurado não está disponível no momento."
    );
});

test("HF_TIMEOUT gera mensagem correta", () => {

    const error =
        new Error("HF_TIMEOUT");

    assert.equal(
        getAIErrorMessage(error),
        "⏱️ A IA demorou demais para responder. Tenta novamente."
    );
});

// ========================================
// 🔍 NORMALIZAÇÃO DOS ERROS
// ========================================

test("401 vira HF_AUTH", () => {

    const error =
        normalizeHFError({
            status: 401
        });

    assert.equal(
        error.message,
        "HF_AUTH"
    );
});

test("429 vira HF_RATE_LIMIT", () => {

    const error =
        normalizeHFError({
            status: 429
        });

    assert.equal(
        error.message,
        "HF_RATE_LIMIT"
    );
});

test("404 vira HF_MODEL_NOT_FOUND", () => {

    const error =
        normalizeHFError({
            status: 404
        });

    assert.equal(
        error.message,
        "HF_MODEL_NOT_FOUND"
    );
});

test("504 vira HF_TIMEOUT", () => {

    const error =
        normalizeHFError({
            status: 504
        });

    assert.equal(
        error.message,
        "HF_TIMEOUT"
    );
});

test("erro desconhecido vira HF_UNKNOWN", () => {

    const error =
        normalizeHFError({
            status: 500
        });

    assert.equal(
        error.message,
        "HF_UNKNOWN"
    );
});

// ========================================
// 🎭 PERSONALIDADE
// ========================================

test("personalidade padrão existe", () => {

    const personality =
        defaultPersonality();

    assert.ok(
        personality.includes("Carbot")
    );

    assert.ok(
        personality.includes("longhorn2004")
    );
});