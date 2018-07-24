const express = require('express');
const app = express();

const fs = require('fs')
const caller = fs.readFileSync('caller.html')
let answer = fs.readFileSync('answer.html')

/* ----------------------------------------------------------------  */

app.get('/caller', (req, res) => {
  res.end(caller)
})

app.post('/answer/:data', (req, res) => {
  const data = req.query.data
  fs.writeFileSync('answer.html', data)
  answer = fs.readFileSync('answer.html')
  res.end('new file available')
})

app.get('/answer', (req, res) => {
  res.end(answer)
})

/* ----------------------------------------------------------------  */

const README = fs.readFileSync('README.html')
app.get('/', (req, res) => {
  res.end(README)
})


app.listen(8080)
