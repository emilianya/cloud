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
        'wdark': '#3c3c45',
        'wgreen': '#70ee9c',
        'wwhite': "#f3eff5",
        'wblue': '#2589bd',
        'wblue-dark': '#227baa'
      },
      margin: {
        "20p": "20%"
      }
    },
  },
  variants: {
    extend: {}
  },
  plugins: [
    require('@tailwindcss/line-clamp')
  ],
}
