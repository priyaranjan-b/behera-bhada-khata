import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  cssVariables: true,
  palette: {
    mode: "light",
    primary: { main: "#4338CA" },
    secondary: { main: "#0891B2" },
    background: { default: "#F8FAFC", paper: "#FFFFFF" },
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { textTransform: "none", fontWeight: 600 } },
    },
    MuiCard: {
      defaultProps: { variant: "outlined" },
    },
    MuiPaper: {
      defaultProps: { variant: "outlined" },
    },
    MuiTextField: {
      defaultProps: { size: "small" },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0, color: "inherit" },
      styleOverrides: { root: { borderBottom: "1px solid #E2E8F0" } },
    },
  },
});

export default theme;
