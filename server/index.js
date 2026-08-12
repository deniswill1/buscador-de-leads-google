require('dotenv').config();
const path = require('path');
const express = require('express');

require('./db'); // garante que o banco e as tabelas existam antes de subir o servidor

const searchRoutes = require('./routes/search');
const leadsRoutes = require('./routes/leads');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' })); // backups grandes de leads podem passar do limite padrão (100kb)
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/search', searchRoutes);
app.use('/api/leads', leadsRoutes);

app.listen(PORT, () => {
  console.log(`Buscador de leads rodando em http://localhost:${PORT}`);
});
