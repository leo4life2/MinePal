import { OpenAIModel } from "../types/apiTypes";

const openAIModels: { value: OpenAIModel, label: string }[] = [
  {
    value: "gpt-4o-mini",
    label: "gpt-4o-mini"
  },
  {
    value: "gpt-4o",
    label: "gpt-4o"
  }
];

export default openAIModels;
