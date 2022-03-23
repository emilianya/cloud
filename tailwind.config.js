module.exports = {
  content: [
	"./public/*.ejs",
	"./public/common/*.ejs",
  "./public/resources/*.js"
  ],
  darkMode: 'media', // or 'media' or 'class'
  theme: {
    extend: {
      colors: {
        'button-dark': '#3c3c45'
      },
      margin: {
        "20p": "20%"
      }
    },
  },
  variants: {
    extend: {}
  },
  plugins: [],
}
