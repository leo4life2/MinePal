import { createContext, useContext } from "react";

type ThemeContextType = {
  isDarkMode: boolean;
  toggleTheme: () => void;
}

const DEFAULT_THEME_CONTEXT: ThemeContextType = {
  isDarkMode: false,
  toggleTheme: () => { },
};

export const ThemeContext = createContext(DEFAULT_THEME_CONTEXT);

export function useTheme() {
  return useContext(ThemeContext);
} 