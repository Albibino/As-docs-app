import enUS from "../public/locales/en-US/translation.json";
import ptBR from "../public/locales/pt-BR/translation.json";
import i18n from "./i18n";

const translations = {
  Prev: "Anterior",
  "Device Name": "Nome do dispositivo",
  "Last Active": "Última atividade",
  "Choose the page edit mode new members start with. Existing members are not affected.":
    "Escolha o modo de edição de página inicial para novos membros. Os membros existentes não são afetados.",
  "Enable AI Chat to allow users to have multi-turn conversations with AI about your workspace content.":
    "Ative o Chat com IA para permitir que os usuários mantenham conversas contínuas com a IA sobre o conteúdo do espaço de trabalho.",
} as const;

describe("traduções da interface", () => {
  it.each(Object.entries(translations))(
    "define a chave %s no locale-fonte e no pt-BR",
    (key, portuguese) => {
      expect(enUS[key as keyof typeof enUS]).toBe(key);
      expect(ptBR[key as keyof typeof ptBR]).toBe(portuguese);
    },
  );
});

describe("idioma padrão do cliente", () => {
  it("inicia o i18next em Português (Brasil)", () => {
    expect(i18n.language).toBe("pt-BR");
  });
});
