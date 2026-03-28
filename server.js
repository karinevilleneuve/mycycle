// server.js - Using ES Modules syntax
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001; // Back-end runs on port 3001

// Middleware
app.use(cors());
app.use(express.json());

// Path to our data file
const DATA_FILE = path.join(__dirname, 'period-data.json');

// Initialize data file if it doesn't exist
if (!fs.existsSync(DATA_FILE)) {
    const initialData = {
        periodDates: [],
        symptoms: {},
        iudInsertionDate: null,
        lastUpdated: new Date().toISOString()
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
    console.log('Created new data file:', DATA_FILE);
}

// READ - Get all data
app.get('/api/data', (req, res) => {
    try {
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        res.json(JSON.parse(data));
    } catch (error) {
        console.error('Error reading data:', error);
        res.status(500).json({ error: 'Failed to read data' });
    }
});

// WRITE - Save all data
app.post('/api/data', (req, res) => {
    try {
        const newData = req.body;
        newData.lastUpdated = new Date().toISOString();
        
        fs.writeFileSync(DATA_FILE, JSON.stringify(newData, null, 2));
        res.json({ success: true, message: 'Data saved successfully' });
    } catch (error) {
        console.error('Error saving data:', error);
        res.status(500).json({ error: 'Failed to save data' });
    }
});

// Update only period dates
app.post('/api/periods', (req, res) => {
    try {
        const { periodDates } = req.body;
        
        const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        data.periodDates = periodDates;
        data.lastUpdated = new Date().toISOString();
        
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        
        res.json({ success: true, message: 'Periods saved' });
    } catch (error) {
        console.error('Error saving periods:', error);
        res.status(500).json({ error: 'Failed to save periods' });
    }
});

// Update symptoms
app.post('/api/symptoms', (req, res) => {
    try {
        const { symptoms } = req.body;
        
        const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        data.symptoms = symptoms;
        data.lastUpdated = new Date().toISOString();
        
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        
        res.json({ success: true, message: 'Symptoms saved' });
    } catch (error) {
        console.error('Error saving symptoms:', error);
        res.status(500).json({ error: 'Failed to save symptoms' });
    }
});

// Update IUD date
app.post('/api/iud', (req, res) => {
    try {
        const { iudInsertionDate } = req.body;
        
        const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        data.iudInsertionDate = iudInsertionDate;
        data.lastUpdated = new Date().toISOString();
        
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        
        res.json({ success: true, message: 'IUD date saved' });
    } catch (error) {
        console.error('Error saving IUD date:', error);
        res.status(500).json({ error: 'Failed to save IUD date' });
    }
});

// Export data as CSV
app.get('/api/export/csv', (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        
        let csv = 'Date,Type,Details\n';
        
        data.periodDates.forEach(date => {
            csv += `${date},Period,Period day\n`;
        });
        
        Object.entries(data.symptoms).forEach(([date, info]) => {
            info.symptoms.forEach(symptom => {
                csv += `${date},Symptom,${symptom}\n`;
            });
            if (info.notes) {
                csv += `${date},Note,${info.notes.replace(/,/g, ';')}\n`;
            }
        });
        
        if (data.iudInsertionDate) {
            csv += `${data.iudInsertionDate},IUD,Insertion date\n`;
        }
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=period-tracker-export.csv');
        res.send(csv);
    } catch (error) {
        console.error('Error exporting CSV:', error);
        res.status(500).json({ error: 'Failed to export CSV' });
    }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📁 Data file: ${DATA_FILE}`);
});

console.log('Back-end API ready!');
