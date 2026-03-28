// src/services/api.js - Handles all API calls to back-end

const API_URL = 'http://192.168.0.161:3001/api'; // Replace with your server IP

export const api = {
    // Get all data
    async getAllData() {
        try {
            const response = await fetch(`${API_URL}/data`);
            if (!response.ok) throw new Error('Failed to fetch data');
            return await response.json();
        } catch (error) {
            console.error('Error fetching data:', error);
            return null;
        }
    },
    
    // Save all data
    async saveAllData(data) {
        try {
            const response = await fetch(`${API_URL}/data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            return await response.json();
        } catch (error) {
            console.error('Error saving data:', error);
            return null;
        }
    },
    
    // Save period dates only
    async savePeriods(periodDates) {
        try {
            const response = await fetch(`${API_URL}/periods`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ periodDates })
            });
            return await response.json();
        } catch (error) {
            console.error('Error saving periods:', error);
            return null;
        }
    },
    
    // Save symptoms only
    async saveSymptoms(symptoms) {
        try {
            const response = await fetch(`${API_URL}/symptoms`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symptoms })
            });
            return await response.json();
        } catch (error) {
            console.error('Error saving symptoms:', error);
            return null;
        }
    },
    
    // Save IUD date
    async saveIUD(iudInsertionDate) {
        try {
            const response = await fetch(`${API_URL}/iud`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ iudInsertionDate })
            });
            return await response.json();
        } catch (error) {
            console.error('Error saving IUD date:', error);
            return null;
        }
    },
    
    // Export as CSV
    async exportCSV() {
        try {
            window.open(`${API_URL}/export/csv`, '_blank');
        } catch (error) {
            console.error('Error exporting CSV:', error);
        }
    }
};
