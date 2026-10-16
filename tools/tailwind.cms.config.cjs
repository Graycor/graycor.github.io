// Tailwind settings for cms.html, moved out of the page when the Play CDN script was
// dropped. The colours and fonts match the Congregate app's own theme, so the marketing
// page and the in-app /product page stay one design.
module.exports = {
  content: ["./cms.html"],
  theme: {
    extend: {
      colors: {
        "brand-header": "#628c6f",
        brand: { DEFAULT: "#46694f", dark: "#36523e", 50: "#eef4f0", 100: "#d9e6df" },
        accent: { DEFAULT: "#b08542", dark: "#8f6a2f", darker: "#6f5226", light: "#d8ad62" },
      },
      fontFamily: {
        serif: ["Georgia", "Iowan Old Style", "Palatino Linotype", "Book Antiqua", "Palatino", "Times New Roman", "serif"],
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
      },
    },
  },
};
