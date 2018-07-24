const showdown = require('showdown')
const converter = new showdown.Converter()

const fs = require('fs')

const markdown = fs.readFileSync('README.md', { encoding: 'utf8' })
const html = converter.makeHtml(markdown)

fs.writeFileSync('README.html', html)
