module.exports = {
  content: [
	"./public/*.ejs",
	"./public/common/*.ejs",
  "./public/resources/*.js",
  './node_modules/tw-elements/dist/js/**/*.js'
  ],
  darkMode: 'media', // or 'media' or 'class'
  theme: {
    extend: {
      colors: {
        'wwhite': '#3c3c45',
        'wgreen': '#70ee9c',
        'wdark': "#f3eff5",
        'wblue': '#2589bd',
        'wblue-dark': '#227baa',
        'wlight': '#e0e0e0'
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
    require('@tailwindcss/line-clamp'),
    require('tw-elements/dist/plugin')
  ],
}
