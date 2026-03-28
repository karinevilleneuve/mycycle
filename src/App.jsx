import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [periodDates, setPeriodDates] = useState([]);
  const [symptoms, setSymptoms] = useState({});
  const [showModal, setShowModal] = useState(false);
  const [selectedSymptoms, setSelectedSymptoms] = useState([]);
  const [notes, setNotes] = useState('');
  const [prediction, setPrediction] = useState(null);
  const [showPredictionModal, setShowPredictionModal] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [iudInsertionDate, setIudInsertionDate] = useState(null);
  const [showIudModal, setShowIudModal] = useState(false);
  const [tempIudDate, setTempIudDate] = useState('');
  const [iudReplacementDate, setIudReplacementDate] = useState(null);
  const [monthsUntilReplacement, setMonthsUntilReplacement] = useState(null);

    // List of available symptoms users can track
  const symptomOptions = [
    'Cramps', 'Headache', 'Bloating', 'Fatigue', 'Breast Tenderness',
    'Mood Swings', 'Acne', 'Back Pain', 'Nausea', 'Insomnia',
    'Cravings', 'Anxiety', 'Spotting', 'Heavy Flow', 'Light Flow'
  ];

  /**
   * Load saved data from browser's localStorage when component first mounts
   * This restores previously saved period dates and symptoms
   */
  useEffect(() => {
    const savedPeriods = localStorage.getItem('periodDates');
    const savedSymptoms = localStorage.getItem('symptoms');
    const savedIudDate = localStorage.getItem('iudInsertionDate');
    if (savedPeriods) setPeriodDates(JSON.parse(savedPeriods));
    if (savedSymptoms) setSymptoms(JSON.parse(savedSymptoms));
    if (savedIudDate) {
    const iudDate = new Date(JSON.parse(savedIudDate));
    setIudInsertionDate(iudDate);
    calculateIudReplacement(iudDate);
  }
    setIsLoaded(true); // save data
  }, []);

  /**
   * Save data to localStorage whenever periodDates or symptoms change
   * Also recalculate predictions when period data updates
   * Uses isLoaded flag to prevent overwriting saved data with empty initial state
   */
  useEffect(() => {
    if (!isLoaded) return; // PREVENT overwrite on first load

    localStorage.setItem('periodDates', JSON.stringify(periodDates));
    localStorage.setItem('symptoms', JSON.stringify(symptoms));
    if (periodDates.length > 0) {
      updatePredictions();
    }
    if (iudInsertionDate) {
    localStorage.setItem('iudInsertionDate', JSON.stringify(iudInsertionDate));
    }
  }, [periodDates, symptoms, iudInsertionDate]);

  /**
   * MAIN PREDICTION ALGORITHM
   * Analyzes historical period data to predict future cycles
   * Uses statistical methods including: average, median, mode, weighted average, and trend analysis
   */
  const calculatePeriodPredictions = () => {
    if (periodDates.length < 2) return null;

// Step 1: Group consecutive period days into separate periods
    const sortedDates = [...periodDates].sort((a, b) => new Date(a) - new Date(b));
    const periodGroups = [];
    let currentGroup = [sortedDates[0]];

    // Group dates that are within 2 days of each other (same period)
    for (let i = 1; i < sortedDates.length; i++) {
      const currentDateObj = new Date(sortedDates[i]);
      const prevDateObj = new Date(sortedDates[i - 1]);
      const diffDays = (currentDateObj - prevDateObj) / (1000 * 60 * 60 * 24);
      
      if (diffDays <= 2) {
        currentGroup.push(sortedDates[i]); // Same period continues
      } else {
        periodGroups.push(currentGroup);  // Period ended, start new group
        currentGroup = [sortedDates[i]];
      }
    }
    periodGroups.push(currentGroup); // Push the last group

// Step 2: Extract period start dates from each group
    const periodStarts = periodGroups.map(group => group[0]);
    
    if (periodStarts.length < 2) return null;

// Step 3: Calculate cycle lengths (days between period starts)
    const cycleLengths = [];
    for (let i = 1; i < periodStarts.length; i++) {
      const start = new Date(periodStarts[i - 1]);
      const end = new Date(periodStarts[i]);
      const cycleLength = Math.round((end - start) / (1000 * 60 * 60 * 24));
      cycleLengths.push(cycleLength);
    }

// Step 4: Calculate period durations
    const periodDurations = periodGroups.map(group => group.length);
    const avgDuration = periodDurations.reduce((a, b) => a + b, 0) / periodDurations.length;

// Step 5: Statistical analysis of cycle lengths
    const avgCycleLength = cycleLengths.reduce((a, b) => a + b, 0) / cycleLengths.length;
    const sortedCycleLengths = [...cycleLengths].sort((a, b) => a - b);
    const medianCycleLength = sortedCycleLengths[Math.floor(sortedCycleLengths.length / 2)];
    const modeCycleLength = getMode(cycleLengths);
    
// Step 6: Calculate standard deviation for confidence intervals
    const variance = cycleLengths.reduce((acc, val) => acc + Math.pow(val - avgCycleLength, 2), 0) / cycleLengths.length;
    const stdDev = Math.sqrt(variance);
    
// Step 7: Detect trends (whether cycles are getting longer or shorter)
    let trend = 0;
    if (cycleLengths.length >= 3) {
      for (let i = 1; i < cycleLengths.length; i++) {
        trend += cycleLengths[i] - cycleLengths[i - 1];
      }
      trend = trend / (cycleLengths.length - 1);
    }

// Step 8: Weighted prediction giving more importance to recent cycles
    let weightedPrediction = 0;
    const weights = cycleLengths.map((_, index) => Math.exp(index - cycleLengths.length + 1));
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    weightedPrediction = cycleLengths.reduce((sum, length, index) => sum + length * weights[index], 0) / totalWeight;

// Step 9: Combine multiple prediction methods for better accuracy
    const lastPeriodStart = new Date(periodStarts[periodStarts.length - 1]);
    const predictions = [
      avgCycleLength,
      medianCycleLength,
      modeCycleLength,
      weightedPrediction,
      avgCycleLength + trend
    ].filter(p => p > 0);
    
    const finalPrediction = predictions.reduce((a, b) => a + b, 0) / predictions.length;
    
// Step 10: Calculate confidence interval bounds
    const lowerBound = finalPrediction - stdDev;
    const upperBound = finalPrediction + stdDev;
    
// Step 11: Predict next 3 periods
    const nextPeriods = [];
    for (let i = 1; i <= 3; i++) {
      const predictedDate = new Date(lastPeriodStart);
      predictedDate.setDate(predictedDate.getDate() + Math.round(finalPrediction * i));
      nextPeriods.push({
        date: predictedDate,
        cycleLength: Math.round(finalPrediction),
        confidence: calculateConfidence(stdDev, finalPrediction)
      });
    }
    
// Step 12: Calculate ovulation (typically 14 days before next period)
    const ovulationDate = new Date(nextPeriods[0].date);
    ovulationDate.setDate(ovulationDate.getDate() - 14);
    
// Step 13: Calculate fertile window (5 days before ovulation to 1 day after)
    const fertileWindowStart = new Date(ovulationDate);
    fertileWindowStart.setDate(fertileWindowStart.getDate() - 5);
    const fertileWindowEnd = new Date(ovulationDate);
    fertileWindowEnd.setDate(fertileWindowEnd.getDate() + 1);
    
// Step 14: Analyze cycle regularity
    const regularity = calculateRegularity(cycleLengths);
    
// Step 15: Predict likely symptoms based on historical patterns
    const predictedSymptoms = predictSymptoms(periodStarts, periodDurations, symptoms);
  // Return comprehensive prediction data  
    return {
      nextPeriods,
      ovulationDate,
      fertileWindow: { start: fertileWindowStart, end: fertileWindowEnd },
      statistics: {
        avgCycleLength: Math.round(avgCycleLength * 10) / 10,
        medianCycleLength: Math.round(medianCycleLength * 10) / 10,
        stdDev: Math.round(stdDev * 10) / 10,
        avgDuration: Math.round(avgDuration * 10) / 10,
        cycleCount: cycleLengths.length,
        trend: Math.round(trend * 10) / 10,
        regularity
      },
      predictedSymptoms,
      confidenceInterval: {
        lower: Math.round(lowerBound * 10) / 10,
        upper: Math.round(upperBound * 10) / 10
      }
    };
  };
    /**
   * Helper: Calculate the most frequently occurring value in an array
   * Used to find the most common cycle length
   */
  const getMode = (arr) => {
    const frequency = {};
    let maxFreq = 0;
    let mode = arr[0];
    
    arr.forEach(num => {
      frequency[num] = (frequency[num] || 0) + 1;
      if (frequency[num] > maxFreq) {
        maxFreq = frequency[num];
        mode = num;
      }
    });
    
    return mode;
  };
   /**
   * Helper: Calculate prediction confidence based on coefficient of variation
   * Lower variation = higher confidence
   */
  const calculateConfidence = (stdDev, mean) => {
    const cv = stdDev / mean;
    if (cv < 0.05) return 'Very High';
    if (cv < 0.1) return 'High';
    if (cv < 0.15) return 'Moderate';
    if (cv < 0.2) return 'Low';
    return 'Very Low';
  };
  /**
  * Helper: Classify cycle regularity based on coefficient of variation
  */
  const calculateRegularity = (cycleLengths) => {
    const variance = cycleLengths.reduce((acc, val) => acc + Math.pow(val - cycleLengths.reduce((a,b) => a+b,0)/cycleLengths.length, 2), 0) / cycleLengths.length;
    const stdDev = Math.sqrt(variance);
    const cv = stdDev / (cycleLengths.reduce((a,b) => a+b,0)/cycleLengths.length);
    
    if (cv < 0.05) return 'Very Regular';
    if (cv < 0.1) return 'Regular';
    if (cv < 0.15) return 'Moderately Regular';
    if (cv < 0.2) return 'Somewhat Irregular';
    return 'Irregular';
  };

    /**
   * Helper: Predict which symptoms are most likely to occur during next period
   * Based on frequency of symptoms during historical periods
   */
  
  const predictSymptoms = (periodStarts, periodDurations, symptomsData) => {
    const symptomFrequency = {};
    const symptomIntensity = {};
    
    // Analyze symptom patterns around period dates
    periodStarts.forEach((start, index) => {
      const duration = periodDurations[index];
      const periodStartDate = new Date(start);
      
     // Check symptoms during each day of the period
      for (let i = 0; i < duration; i++) {
        const checkDate = new Date(periodStartDate);
        checkDate.setDate(checkDate.getDate() + i);
        const dateString = checkDate.toDateString();
        const daySymptoms = symptomsData[dateString];
        
        if (daySymptoms && daySymptoms.symptoms) {
          daySymptoms.symptoms.forEach(symptom => {
            symptomFrequency[symptom] = (symptomFrequency[symptom] || 0) + 1;
          });
        }
      }
    });
    
    // Calculate probability for each symptom (percentage of period days it occurred)
    const totalPeriodDays = periodDurations.reduce((a,b) => a+b, 0);
    const predictedSymptomsList = Object.entries(symptomFrequency)
      .map(([symptom, frequency]) => ({
        symptom,
        probability: (frequency / totalPeriodDays) * 100
      }))
      .filter(item => item.probability > 30) // Only include symptoms that occur >30% of the time
      .sort((a, b) => b.probability - a.probability) // Sort by probability
      .slice(0, 5); // Return top 5 most likely symptoms
    
    return predictedSymptomsList;
  };
    
  /**
   * Wrapper function to update predictions state
   */
  
  const updatePredictions = () => {
    const predictions = calculatePeriodPredictions();
    setPrediction(predictions);
  };

    /**
   * Calculate days until next predicted period
   * Returns null if no prediction available
   */
  const getDaysUntilNextPeriod = () => {
    if (!prediction || !prediction.nextPeriods[0]) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nextPeriod = new Date(prediction.nextPeriods[0].date);
    const diffDays = Math.ceil((nextPeriod - today) / (1000 * 60 * 60 * 24));
    return diffDays;
  };
   /**
   * Calendar helper: Get number of days in month and starting day of week
   */
  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    
    return { daysInMonth, startingDayOfWeek };
  };
    /**
   * Check if a given date is predicted to be a period day
   * Compares against all predicted periods and their average duration
   */
  const isPredictedPeriodDay = (date) => {
    if (!prediction) return false;
    const dateString = date.toDateString();
    
    for (const period of prediction.nextPeriods) {
      const periodDate = new Date(period.date);
      const periodEndDate = new Date(periodDate);
      periodEndDate.setDate(periodEndDate.getDate() + prediction.statistics.avgDuration);
      
      if (date >= periodDate && date <= periodEndDate) {
        return true;
      }
    }
    return false;
  };
    /**
   * Check if a date falls within the predicted fertile window
   */
  const isFertileDay = (date) => {
    if (!prediction) return false;
    const dateString = date.toDateString();
    const fertileStart = new Date(prediction.fertileWindow.start);
    const fertileEnd = new Date(prediction.fertileWindow.end);
    
    return date >= fertileStart && date <= fertileEnd;
  };
    /**
   * Check if a date is the predicted ovulation day
   */
  const isOvulationDay = (date) => {
    if (!prediction) return false;
    return date.toDateString() === prediction.ovulationDate.toDateString();
  };
  
  /*************************            END OF MODEL             *************************/


    /**
   * Calculate IUD replacement date and months remaining
   * IUD lasts 8 years (96 months)
   */
  const calculateIudReplacement = (insertionDate) => {
    if (!insertionDate) return null;
    
    const insertion = new Date(insertionDate);
    const replacementDate = new Date(insertion);
    replacementDate.setFullYear(insertion.getFullYear() + 8);
    
    const today = new Date();
    const monthsRemaining = (replacementDate.getFullYear() - today.getFullYear()) * 12 +
      (replacementDate.getMonth() - today.getMonth());
    
    setIudReplacementDate(replacementDate);
    setMonthsUntilReplacement(monthsRemaining);
    
    return { replacementDate, monthsRemaining };
  };

  /**
   * Get IUD replacement status text
   */
  const getIudStatus = () => {
    if (!iudInsertionDate) return null;
    
    const monthsLeft = monthsUntilReplacement;
    
    if (monthsLeft <= 0) {
      return {
        status: 'EXPIRED',
        message: 'Your IUD has expired and should be replaced asap',
        color: '#ff4444'
      };
    } else if (monthsLeft <= 6) {
      return {
        status: 'URGENT',
        message: `Your IUD expires in ${monthsLeft} month${monthsLeft !== 1 ? 's' : ''}! Schedule replacement soon.`,
        color: '#ff9800'
      };
    } else if (monthsLeft <= 12) {
      return {
        status: 'WARNING',
        message: `Your IUD will expire in ${monthsLeft} months. Plan for replacement.`,
        color: '#ffc107'
      };
    } else {
      return {
        status: 'OK',
        message: `Your IUD is valid for ${monthsLeft} more months.`,
        color: '#4caf50'
      };
    }
  };

  /**
   * Set IUD insertion date
   */
  const setIudDate = () => {
    if (tempIudDate) {
      const selectedDate = new Date(tempIudDate);
      if (!isNaN(selectedDate.getTime())) {
        setIudInsertionDate(selectedDate);
        calculateIudReplacement(selectedDate);
        setShowIudModal(false);
        setTempIudDate('');
      } else {
        alert('Please enter a valid date');
      }
    }
  };

  /**
   * Remove IUD data
   */
  const removeIudData = () => {
    setIudInsertionDate(null);
    setIudReplacementDate(null);
    setMonthsUntilReplacement(null);
    localStorage.removeItem('iudInsertionDate');
    setShowIudModal(false);
  };

    /**
   * Handle clicking on a calendar day - opens modal to add/edit symptoms
   */

  const handleDateClick = (day) => {
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    setSelectedDate(date);
    const dateString = date.toDateString();
    setSelectedSymptoms(symptoms[dateString]?.symptoms || []);
    setNotes(symptoms[dateString]?.notes || '');
    setShowModal(true);
  };
    /**
   * Add selected date as a period day
   */

  const addPeriodDate = () => {
    if (selectedDate) {
      const dateString = selectedDate.toDateString();
      if (!periodDates.includes(dateString)) {
        setPeriodDates([...periodDates, dateString]);
      }
    }
  };

    /**
   * Remove period status from selected date
   */

  const removePeriodDate = () => {
    if (selectedDate) {
      const dateString = selectedDate.toDateString();
      setPeriodDates(periodDates.filter(date => date !== dateString));
    }
  };
  
   /**
   * Save symptoms and notes for the selected date
   */

  const saveSymptoms = () => {
    if (selectedDate) {
      const dateString = selectedDate.toDateString();
      
      // Check if there are any symptoms or notes to save
      const hasSymptoms = selectedSymptoms.length > 0;
      const hasNotes = notes.trim().length > 0;
      
      if (hasSymptoms || hasNotes) {
        // Save the data if there are symptoms or notes
        setSymptoms({
          ...symptoms,
          [dateString]: {
            symptoms: selectedSymptoms,
            notes: notes
          }
        });
      } else {
        // Remove the entry completely if no symptoms and no notes
        const updatedSymptoms = { ...symptoms };
        delete updatedSymptoms[dateString];
        setSymptoms(updatedSymptoms);
      }
      
      setShowModal(false);
    }
  };
  
    /**
   * Toggle a symptom on/off for the selected date
   */
  const toggleSymptom = (symptom) => {
    if (selectedSymptoms.includes(symptom)) {
      setSelectedSymptoms(selectedSymptoms.filter(s => s !== symptom));
    } else {
      setSelectedSymptoms([...selectedSymptoms, symptom]);
    }
  };

    /**
   * Render the calendar grid for the current month
   * Creates empty cells for days from previous month, then fills with actual days
   * Applies CSS classes based on period status, predictions, and symptoms
   */
  
  const renderCalendar = () => {
    const { daysInMonth, startingDayOfWeek } = getDaysInMonth(currentDate);
    const days = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset time to compare just dates

  // Add empty cells for days before the 1st of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(<div key={`empty-${i}`} className="calendar-day empty"></div>);
    }
    
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
      const dateString = date.toDateString();
      const hasPeriod = periodDates.includes(dateString);
      const hasSymptoms = symptoms[dateString];
      const isPredicted = isPredictedPeriodDay(date);
      const isFertile = isFertileDay(date);
      const isOvulation = isOvulationDay(date);

       // Check if this date is today
      const isToday = date.toDateString() === today.toDateString();
      
      // Determine styling and dot indicator based on day's status

      let additionalClass = '';
      let dotType = null;
      
      if (hasPeriod) {
        additionalClass = 'has-period';
        dotType = 'period';
      } else if (isPredicted) {
        additionalClass = 'predicted-period';
        dotType = 'predicted';
      } else if (isOvulation) {
        additionalClass = 'ovulation';
        dotType = 'ovulation';
      } else if (isFertile) {
        additionalClass = 'fertile';
        dotType = 'fertile';
      } else if (hasSymptoms) {
        additionalClass = 'has-symptoms';
        dotType = 'symptoms';
      }
      // Add 'today' class if this is the current date
      if (isToday) {
      additionalClass += ' today';
      }
      
      
      days.push(
        <div
          key={day}
          className={`calendar-day ${additionalClass}`}
          onClick={() => handleDateClick(day)}
        >
          <span className="day-number">{day}</span>
          {dotType === 'period' && <div className="period-dot"></div>}
          {dotType === 'predicted' && <div className="predicted-dot"></div>}
          {dotType === 'ovulation' && <div className="ovulation-dot"></div>}
          {dotType === 'fertile' && <div className="fertile-dot"></div>}
          {dotType === 'symptoms' && <div className="symptoms-dot"></div>}
        </div>
      );
    }
    
    return days;
  };
  
  
  /**
   * Format month and year for display
   */
  /**
 * Change current month by increment (positive or negative)
 */
  const changeMonth = (increment) => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + increment, 1));
  };

  /**
   * Go to current date/today
   */
  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const getMonthYearString = () => {
    return currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });
  };
  
  const daysUntilNextPeriod = getDaysUntilNextPeriod();
  
 // JSX RENDERING SECTION

  return (
    <div className="App">
      <div className="container">
        <header className="header">
          <h1>Period Tracker</h1>
          <p className="subtitle">Smart cycle tracking and prediction</p>
        </header>
        
        {prediction && (
          <div className="prediction-banner" onClick={() => setShowPredictionModal(true)}>
            <div className="prediction-content">
              <div className="prediction-main">
                <span className="prediction-icon"></span>
                <div>
                  <div className="prediction-title">Next Period Prediction</div>
                  <div className="prediction-date">
                    {prediction.nextPeriods[0].date.toLocaleDateString('default', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </div>
                  {daysUntilNextPeriod !== null && (
                    <div className="prediction-days">
                      {daysUntilNextPeriod === 0 ? 'Expected today!' : 
                       daysUntilNextPeriod < 0 ? `${Math.abs(daysUntilNextPeriod)} days ago` : 
                       `In ${daysUntilNextPeriod} days`}
                    </div>
                  )}
                </div>
              </div>
              <div className="prediction-confidence">
                Confidence: {prediction.nextPeriods[0].confidence}
              </div>
            </div>
          </div>
        )}
        
        <div className="calendar-container">
          <div className="calendar-header">
            <button onClick={() => changeMonth(-1)} className="nav-button">←</button>
            <h2>{getMonthYearString()}</h2>
            <button onClick={() => changeMonth(1)} className="nav-button">→</button>
             <button onClick={goToToday} className="today-button">Today</button>
          </div>
          
          <div className="calendar-weekdays">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="weekday">{day}</div>
            ))}
          </div>
          
          <div className="calendar-grid">
            {renderCalendar()}
          </div>
        </div>
        {/* Legend - Make sure this is here */}
        <div className="legend">
          <div className="legend-item">
            <span className="legend-label-period">Period day</span>
            <span className="period-dot"></span>
          </div>
          <div className="legend-item">
            <span className="legend-label-predicted">Predicted period</span>
          </div>
          <div className="legend-item">
            <span className="legend-label-ovulation">Ovulation day</span>
          </div>
          <div className="legend-item">
            <span className="legend-label-fertile">Fertile window</span>
          </div>
          <div className="legend-item">

            <span className="legend-label-symptoms">Symptoms tracked</span>
          </div>
        </div>
        
                {/* IUD Date Modal */}
        {showIudModal && (
          <div className="modal-overlay" onClick={() => setShowIudModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h3>Set IUD Insertion Date</h3>
              
              <div className="iud-info-text">
                <p>Hormonal IUDs typically last 8 years (96 months).</p>
                <p>Enter the date your IUD was inserted to track when it needs replacement.</p>
              </div>
              
              <div className="iud-date-input">
                <label>Insertion Date:</label>
                <input
                  type="date"
                  value={tempIudDate}
                  onChange={(e) => setTempIudDate(e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                />
              </div>
              
              {iudInsertionDate && (
                <div className="iud-current-date">
                  <p>Current insertion date: {iudInsertionDate.toLocaleDateString()}</p>
                  <button onClick={removeIudData} className="btn-remove-iud">
                    Remove IUD Data
                  </button>
                </div>
              )}
              
              <div className="modal-buttons">
                <button onClick={setIudDate} className="btn-save">
                  {iudInsertionDate ? 'Update Date' : 'Save Date'}
                </button>
                <button onClick={() => setShowIudModal(false)} className="btn-cancel">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal for date details */}
        {showModal && selectedDate && (
          <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h3>{selectedDate.toLocaleDateString('default', { month: 'long', day: 'numeric', year: 'numeric' })}</h3>
              
              <div className="period-section">
                <h4>Period Tracking</h4>
                <div className="button-group">
                  <button onClick={addPeriodDate} className="btn-add">Add Period Day</button>
                  <button onClick={removePeriodDate} className="btn-remove">Remove period</button>
                </div>
                {periodDates.includes(selectedDate.toDateString()) && (
                  <p className="period-status">✓ Period recorded for this day</p>
                )}
              </div>
              
              <div className="symptoms-section">
                <h4>Symptoms</h4>
                <div className="symptoms-grid">
                  {symptomOptions.map(symptom => (
                    <button
                      key={symptom}
                      className={`symptom-button ${selectedSymptoms.includes(symptom) ? 'active' : ''}`}
                      onClick={() => toggleSymptom(symptom)}
                    >
                      {symptom}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="notes-section">
                <h4>Notes</h4>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any additional notes..."
                  rows="3"
                />
              </div>
              
              <div className="modal-buttons">
                <button onClick={saveSymptoms} className="btn-save">Save</button>
                <button onClick={() => setShowModal(false)} className="btn-cancel">Cancel</button>
              </div>
            </div>
          </div>
        )}
        
        {/* Prediction Details Modal */}
        {showPredictionModal && prediction && (
          <div className="modal-overlay" onClick={() => setShowPredictionModal(false)}>
            <div className="modal-content prediction-modal" onClick={(e) => e.stopPropagation()}>
              <h3>Detailed Cycle Analysis</h3>

                <div className="prediction-section">
                  <h4>Cycle Statistics</h4>
                  <div className="stats-grid">
                    <div className="stat-item">
                      <div className="stat-label">Average Cycle Length</div>
                      <div className="stat-value">{prediction.statistics.avgCycleLength} days</div>
                    </div>
                    <div className="stat-item">
                      <div className="stat-label">Median Cycle Length</div>
                      <div className="stat-value">{prediction.statistics.medianCycleLength} days</div>
                    </div>
                    <div className="stat-item">
                      <div className="stat-label">Standard Deviation</div>
                      <div className="stat-value">±{prediction.statistics.stdDev} days</div>
                    </div>
                    <div className="stat-item">
                      <div className="stat-label">Average Duration</div>
                      <div className="stat-value">{prediction.statistics.avgDuration} days</div>
                    </div>
                    <div className="stat-item">
                      <div className="stat-label">Cycles Tracked</div>
                      <div className="stat-value">{prediction.statistics.cycleCount}</div>
                    </div>
                    <div className="stat-item">
                      <div className="stat-label">Regularity</div>
                      <div className="stat-value">{prediction.statistics.regularity}</div>
                    </div>
                  </div>
                </div>

              <div className="prediction-details">
                <div className="prediction-section">
                  <h4>Next 3 Period Predictions</h4>
                  {prediction.nextPeriods.map((period, index) => (
                    <div key={index} className="prediction-item">
                      <strong>Period {index + 1}:</strong> {period.date.toLocaleDateString('default', { month: 'long', day: 'numeric', year: 'numeric' })}
                      <span className={`confidence-badge ${period.confidence.toLowerCase().replace(' ', '-')}`}>{period.confidence} confidence</span>
                    </div>
                  ))}
                </div>
              
              <div className="iud-section">
                <div className="iud-header">
                  <h4>IUD Information</h4>
                  {!iudInsertionDate ? (
                    <button onClick={() => setShowIudModal(true)} className="btn-add-iud">
                      + Add IUD Date
                    </button>
                  ) : (
                    <button onClick={() => setShowIudModal(true)} className="btn-edit-iud">
                      Edit
                    </button>
                  )}
                </div>
                
                {iudInsertionDate ? (
                  <div className="iud-details">
                    <div className="iud-date">
                      <strong>Insertion Date:</strong> {iudInsertionDate.toLocaleDateString('default', { 
                        month: 'long', 
                        day: 'numeric', 
                        year: 'numeric' 
                      })}
                    </div>
                    <div className="iud-replacement">
                      <strong>Replace by:</strong> {iudReplacementDate?.toLocaleDateString('default', {
                        month: 'long',
                        day: 'numeric', 
                        year: 'numeric'
                      })}
                    </div>
                    <div className="iud-countdown">
                      <strong>Time remaining:</strong> 
                      <span className={`iud-status ${getIudStatus()?.status.toLowerCase()}`}>
                        {getIudStatus()?.message}
                      </span>
                    </div>
                    <div className="iud-progress">
                      <div className="iud-progress-bar">
                        <div 
                          className="iud-progress-fill" 
                          style={{ 
                            width: `${Math.max(0, Math.min(100, ((96 - (monthsUntilReplacement || 0)) / 96) * 100))}%`,
                            backgroundColor: getIudStatus()?.color
                          }}
                        ></div>
                      </div>
                      <div className="iud-progress-labels">
                        <span>Inserted</span>
                        <span>{Math.floor((96 - (monthsUntilReplacement || 0)) / 12)} years</span>
                        <span>Replace</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="iud-empty">
                    <p>No IUD data added. Add your IUD insertion date to track when replacement is needed.</p>
                    <button onClick={() => setShowIudModal(true)} className="btn-add-iud-primary">
                      Add IUD Insertion Date
                    </button>
                  </div>
                )}
              </div>
              

                
                <div className="prediction-section">
                  <h4>Fertility Information</h4>
                  <div className="fertility-info">
                    <div><strong>Ovulation:</strong> {prediction.ovulationDate.toLocaleDateString('default', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
                    <div><strong>Fertile Window:</strong> {prediction.fertileWindow.start.toLocaleDateString('default', { month: 'long', day: 'numeric' })} - {prediction.fertileWindow.end.toLocaleDateString('default', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
                  </div>
                </div>
                

                
                {prediction.predictedSymptoms.length > 0 && (
                  <div className="prediction-section">
                    <h4>Likely Symptoms Next Period</h4>
                    <div className="symptoms-prediction">
                      {prediction.predictedSymptoms.map((symptom, index) => (
                        <div key={index} className="symptom-probability">
                          <span>{symptom.symptom}</span>
                          <div className="probability-bar">
                            <div className="probability-fill" style={{ width: `${symptom.probability}%` }}></div>
                          </div>
                          <span className="probability-value">{Math.round(symptom.probability)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="prediction-section">
                  <h4>Prediction Confidence</h4>
                  <div className="confidence-interval">
                    <div>95% Confidence Interval: {prediction.confidenceInterval.lower} - {prediction.confidenceInterval.upper} days</div>
                    <div className="confidence-note">
                      *Based on {prediction.statistics.cycleCount} complete cycles
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="modal-buttons">
                <button onClick={() => setShowPredictionModal(false)} className="btn-save">Close</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;