import React, { useState, useEffect, useCallback, useMemo } from 'react';
import './App.css';
import { api } from './services/api';

// ─── Storage key constants (avoids scattered magic strings) ───────────────────
const STORAGE_KEYS = {
  PERIODS: 'periodDates',
  SYMPTOMS: 'symptoms',
  IUD: 'iudInsertionDate',
};

// ─── Date helpers ─────────────────────────────────────────────────────────────
// Always use ISO format "YYYY-MM-DD" as keys — safer than toDateString()
// which is locale-dependent and can vary between browsers/devices.
const toDateKey = (date) => {
  const d = new Date(date);
  // Use local date parts so the key matches the user's calendar day
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const fromDateKey = (key) => new Date(`${key}T00:00:00`); // force local midnight

function App() {
  const [currentDate, setCurrentDate]           = useState(new Date());
  const [selectedDate, setSelectedDate]         = useState(null);
  const [periodDates, setPeriodDates]           = useState([]);   // array of "YYYY-MM-DD" strings
  const [symptoms, setSymptoms]                 = useState({});   // { "YYYY-MM-DD": { symptoms: [], notes: "" } }
  const [showModal, setShowModal]               = useState(false);
  const [selectedSymptoms, setSelectedSymptoms] = useState([]);
  const [notes, setNotes]                       = useState('');
  const [showPredictionModal, setShowPredictionModal] = useState(false);
  const [isLoaded, setIsLoaded]                 = useState(false);
  const [iudInsertionDate, setIudInsertionDate] = useState(null); // Date object or null
  const [showIudModal, setShowIudModal]         = useState(false);
  const [tempIudDate, setTempIudDate]           = useState('');
  const [iudReplacementDate, setIudReplacementDate]   = useState(null);
  const [monthsUntilReplacement, setMonthsUntilReplacement] = useState(null);
  const [syncStatus, setSyncStatus]             = useState('idle'); // idle | syncing | success | error

  // List of available symptoms users can track
  const symptomOptions = [
    'Cramps', 'Headache', 'Bloating', 'Fatigue', 'Breast Tenderness',
    'Mood Swings', 'Acne', 'Back Pain', 'Nausea', 'Insomnia',
    'Cravings', 'Anxiety', 'Spotting', 'Heavy Flow', 'Light Flow',
  ];

  // ─── BUG FIX: moved calculateIudReplacement ABOVE the useEffects that call it
  // (arrow-function const is not hoisted, so calling it before definition = crash)
  const calculateIudReplacement = useCallback((insertionDate) => {
    if (!insertionDate) return;
    const insertion     = new Date(insertionDate);
    const replacement   = new Date(insertion);
    replacement.setFullYear(insertion.getFullYear() + 8);

    const today         = new Date();
    const monthsLeft    =
      (replacement.getFullYear() - today.getFullYear()) * 12 +
      (replacement.getMonth()   - today.getMonth());

    setIudReplacementDate(replacement);
    setMonthsUntilReplacement(monthsLeft);
  }, []);

  // ─── Load data ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const applyData = (data) => {
      // Normalise stored period dates to ISO "YYYY-MM-DD" keys.
      // Old data may have been saved as toDateString() values — convert them.
      const normalisedPeriods = (data.periodDates || []).map((d) => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
        return toDateKey(new Date(d));
      });
      setPeriodDates(normalisedPeriods);
      setSymptoms(data.symptoms || {});
      if (data.iudInsertionDate) {
        const iudDate = new Date(data.iudInsertionDate);
        setIudInsertionDate(iudDate);
        calculateIudReplacement(iudDate);
      }
    };

    // STEP 1 — load localStorage immediately (instant, no network wait)
    // This is what was causing the long "Loading your data…" screen:
    // the app was waiting for the server before showing anything at all.
    const savedPeriods  = localStorage.getItem(STORAGE_KEYS.PERIODS);
    const savedSymptoms = localStorage.getItem(STORAGE_KEYS.SYMPTOMS);
    const savedIud      = localStorage.getItem(STORAGE_KEYS.IUD);
    const localTs       = Number(localStorage.getItem('lastModified') || 0);

    applyData({
      periodDates:      savedPeriods  ? JSON.parse(savedPeriods)  : [],
      symptoms:         savedSymptoms ? JSON.parse(savedSymptoms) : {},
      iudInsertionDate: savedIud      ? JSON.parse(savedIud)      : null,
    });

    setIsLoaded(true); // ← show the app right away with local data

    // STEP 2 — check server in the background, don't block the UI
    const syncFromServer = async () => {
      try {
        const serverData = await api.getAllData();
        const serverTs   = serverData?.lastModified ? Number(serverData.lastModified) : 0;

        // Only update if server data is actually newer than what we loaded locally
        if (serverTs > localTs) {
          applyData(serverData);
          console.log('✅ Updated from server (server data was newer)');
        } else {
          console.log('📱 Kept local data (already up to date)');
        }
      } catch {
        console.warn('Server unavailable, keeping local data');
      }
    };

    syncFromServer();
  }, [calculateIudReplacement]);

  // ─── Save data whenever tracked state changes ─────────────────────────────────
  useEffect(() => {
    if (!isLoaded) return; // don't save during initial hydration

    // PERF: debounce to 1 s so rapid interactions don't spam the server
    const timeoutId = setTimeout(async () => {
      const now = Date.now();

      const dataToSave = {
        periodDates,
        symptoms,
        iudInsertionDate: iudInsertionDate?.toISOString() ?? null,
        lastModified: now,          // timestamp for conflict resolution
      };

      // 1. Always write to localStorage immediately (fast, offline-safe)
      localStorage.setItem(STORAGE_KEYS.PERIODS,  JSON.stringify(periodDates));
      localStorage.setItem(STORAGE_KEYS.SYMPTOMS, JSON.stringify(symptoms));
      localStorage.setItem(STORAGE_KEYS.IUD,      JSON.stringify(iudInsertionDate?.toISOString() ?? null));
      localStorage.setItem('lastModified',         String(now));

      // 2. Try server in background
      setSyncStatus('syncing');
      try {
        const result = await api.saveAllData(dataToSave);
        if (result?.success) {
          setSyncStatus('success');
          setTimeout(() => setSyncStatus('idle'), 2000);
          console.log('💾 Data synced to server');
        } else {
          setSyncStatus('error');
          setTimeout(() => setSyncStatus('idle'), 3000);
        }
      } catch {
        setSyncStatus('error');
        setTimeout(() => setSyncStatus('idle'), 3000);
      }
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [periodDates, symptoms, iudInsertionDate, isLoaded]);

  // ─── Recalculate predictions whenever period data changes ─────────────────────
  // PERF: useMemo so the expensive algorithm only runs when periodDates/symptoms change
  const prediction = useMemo(() => {
    if (periodDates.length < 2) return null;
    return calculatePeriodPredictions(periodDates, symptoms);
  }, [periodDates, symptoms]);
  // Note: we removed the separate `setPrediction` state — prediction is now derived.

  // ─────────────────────────────────────────────────────────────────────────────
  //   PREDICTION ALGORITHM  (pure functions — no state, easy to test/move later)
  // ─────────────────────────────────────────────────────────────────────────────

  function calculatePeriodPredictions(periodDates, symptoms) {
    // Step 1: group consecutive dates into periods (gap ≤ 2 days = same period)
    const sorted = [...periodDates].sort();
    const groups = [];
    let group    = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const prev = fromDateKey(sorted[i - 1]);
      const curr = fromDateKey(sorted[i]);
      const diff = (curr - prev) / 86_400_000;
      if (diff <= 2) {
        group.push(sorted[i]);
      } else {
        groups.push(group);
        group = [sorted[i]];
      }
    }
    groups.push(group);

    const periodStarts    = groups.map((g) => g[0]);
    if (periodStarts.length < 2) return null;

    // Step 2: cycle lengths (days between period starts)
    const cycleLengths = [];
    for (let i = 1; i < periodStarts.length; i++) {
      const diff = Math.round(
        (fromDateKey(periodStarts[i]) - fromDateKey(periodStarts[i - 1])) / 86_400_000
      );
      cycleLengths.push(diff);
    }

    const periodDurations = groups.map((g) => g.length);
    const avgDuration     = periodDurations.reduce((a, b) => a + b, 0) / periodDurations.length;

    // Step 3: statistics
    const avg    = cycleLengths.reduce((a, b) => a + b, 0) / cycleLengths.length;
    const sorted_ = [...cycleLengths].sort((a, b) => a - b);
    const median  = sorted_[Math.floor(sorted_.length / 2)];
    const mode    = getMode(cycleLengths);

    const variance = cycleLengths.reduce((acc, v) => acc + (v - avg) ** 2, 0) / cycleLengths.length;
    const stdDev   = Math.sqrt(variance);

    // Step 4: trend (average change per cycle)
    let trend = 0;
    if (cycleLengths.length >= 3) {
      for (let i = 1; i < cycleLengths.length; i++) trend += cycleLengths[i] - cycleLengths[i - 1];
      trend /= cycleLengths.length - 1;
    }

    // Step 5: weighted average (recent cycles matter more)
    const weights         = cycleLengths.map((_, i) => Math.exp(i - cycleLengths.length + 1));
    const totalWeight     = weights.reduce((a, b) => a + b, 0);
    const weightedAvg     = cycleLengths.reduce((s, l, i) => s + l * weights[i], 0) / totalWeight;

    // Step 6: ensemble prediction
    const predictions   = [avg, median, mode, weightedAvg, avg + trend].filter((p) => p > 0);
    const finalPred     = predictions.reduce((a, b) => a + b, 0) / predictions.length;

    // Step 7: next 3 periods
    const lastStart   = fromDateKey(periodStarts[periodStarts.length - 1]);
    const nextPeriods = [1, 2, 3].map((i) => {
      const d = new Date(lastStart);
      d.setDate(d.getDate() + Math.round(finalPred * i));
      return {
        date:        d,
        cycleLength: Math.round(finalPred),
        confidence:  getConfidence(stdDev, finalPred),
      };
    });
       // Step 7b: missed period adjustment
    // If today is past the predicted start date and no period has been logged,
    // the cycle is running longer than the historical average.
    // We shift the prediction forward and lower confidence to reflect uncertainty.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysLate = Math.floor((today - nextPeriods[0].date) / 86_400_000);

    if (daysLate > 0) {
      // Best guess: today + a small buffer (half stdDev, minimum 2 days).
      // The buffer prevents the prediction from permanently reading "today".
      const buffer = Math.max(2, Math.round(stdDev / 2));
      const adjustedStart = new Date(today);
      adjustedStart.setDate(today.getDate() + buffer);

      // The longer it's been missed, the less confident we can be
      const adjustedConfidence = daysLate <= 3 ? 'Low' : 'Very Low';

      nextPeriods[0] = {
        date:        adjustedStart,
        cycleLength: Math.round(finalPred) + daysLate,
        confidence:  adjustedConfidence,
        daysLate,   // exposed so the banner can show "X days late"
      };

      // Shift periods 2 and 3 forward by the same amount so they stay consistent
      nextPeriods[1].date = new Date(adjustedStart);
      nextPeriods[1].date.setDate(adjustedStart.getDate() + Math.round(finalPred));
      nextPeriods[2].date = new Date(adjustedStart);
      nextPeriods[2].date.setDate(adjustedStart.getDate() + Math.round(finalPred * 2));
    }
    
    // Step 8: ovulation & fertile window (relative to next period)
    const ovulationDate     = new Date(nextPeriods[0].date);
    ovulationDate.setDate(ovulationDate.getDate() - 14);

    const fertileStart = new Date(ovulationDate);
    fertileStart.setDate(fertileStart.getDate() - 5);
    const fertileEnd   = new Date(ovulationDate);
    fertileEnd.setDate(fertileEnd.getDate() + 1);

    return {
      nextPeriods,
      ovulationDate,
      fertileWindow: { start: fertileStart, end: fertileEnd },
      statistics: {
        avgCycleLength:    Math.round(avg    * 10) / 10,
        medianCycleLength: Math.round(median * 10) / 10,
        stdDev:            Math.round(stdDev * 10) / 10,
        avgDuration:       Math.round(avgDuration * 10) / 10,
        cycleCount:        cycleLengths.length,
        trend:             Math.round(trend * 10) / 10,
        regularity:        getRegularity(cycleLengths),
      },
      predictedSymptoms:  getPredictedSymptoms(periodStarts, periodDurations, symptoms),
      confidenceInterval: {
        lower: Math.round((finalPred - stdDev) * 10) / 10,
        upper: Math.round((finalPred + stdDev) * 10) / 10,
      },
    };
  }

  // Pure helper — most common value in array
  function getMode(arr) {
    const freq = {};
    let maxF = 0, mode = arr[0];
    arr.forEach((n) => {
      freq[n] = (freq[n] || 0) + 1;
      if (freq[n] > maxF) { maxF = freq[n]; mode = n; }
    });
    return mode;
  }

  // Confidence label based on coefficient of variation
  function getConfidence(stdDev, mean) {
    const cv = stdDev / mean;
    if (cv < 0.05) return 'Very High';
    if (cv < 0.10) return 'High';
    if (cv < 0.15) return 'Moderate';
    if (cv < 0.20) return 'Low';
    return 'Very Low';
  }

  // Regularity label
  function getRegularity(cycleLengths) {
    const avg  = cycleLengths.reduce((a, b) => a + b, 0) / cycleLengths.length;
    const vari = cycleLengths.reduce((acc, v) => acc + (v - avg) ** 2, 0) / cycleLengths.length;
    const cv   = Math.sqrt(vari) / avg;
    if (cv < 0.05) return 'Very Regular';
    if (cv < 0.10) return 'Regular';
    if (cv < 0.15) return 'Moderately Regular';
    if (cv < 0.20) return 'Somewhat Irregular';
    return 'Irregular';
  }

  // Predict top-5 symptoms likely to recur next period
  function getPredictedSymptoms(periodStarts, periodDurations, symptomsData) {
    const freq = {};
    let totalDays = 0;

    periodStarts.forEach((start, idx) => {
      const dur     = periodDurations[idx];
      totalDays    += dur;
      const startD  = fromDateKey(start);

      for (let i = 0; i < dur; i++) {
        const d   = new Date(startD);
        d.setDate(d.getDate() + i);
        const key = toDateKey(d);
        const day = symptomsData[key];
        if (day?.symptoms) {
          day.symptoms.forEach((s) => { freq[s] = (freq[s] || 0) + 1; });
        }
      }
    });

    if (totalDays === 0) return [];

    return Object.entries(freq)
      .map(([symptom, count]) => ({ symptom, probability: (count / totalDays) * 100 }))
      .filter((item) => item.probability > 30)
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 5);
  }

  // ─── Calendar helpers ──────────────────────────────────────────────────────────

  // PERF: memoised so it only recomputes when the viewed month changes
  const { daysInMonth, startingDayOfWeek } = useMemo(() => {
    const y    = currentDate.getFullYear();
    const m    = currentDate.getMonth();
    const last = new Date(y, m + 1, 0);
    return {
      daysInMonth:       last.getDate(),
      startingDayOfWeek: new Date(y, m, 1).getDay(),
    };
  }, [currentDate]);

  const isPredictedPeriodDay = useCallback((date) => {
    if (!prediction) return false;
    const { nextPeriods, statistics } = prediction;
    return nextPeriods.some((p) => {
      const end = new Date(p.date);
      end.setDate(end.getDate() + statistics.avgDuration);
      return date >= p.date && date <= end;
    });
  }, [prediction]);

  const isFertileDay = useCallback((date) => {
    if (!prediction) return false;
    return date >= prediction.fertileWindow.start && date <= prediction.fertileWindow.end;
  }, [prediction]);

  const isOvulationDay = useCallback((date) => {
    if (!prediction) return false;
    return toDateKey(date) === toDateKey(prediction.ovulationDate);
  }, [prediction]);

  // PERF: memoised calendar grid — only rebuilds when month or tracked data changes
  const calendarDays = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days  = [];

    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(<div key={`empty-${i}`} className="calendar-day empty" />);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date    = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
      const key     = toDateKey(date);
      const isToday = date.toDateString() === today.toDateString();

      const hasPeriod  = periodDates.includes(key);
      const hasSymptom = !!symptoms[key];
      const isPredicted = !hasPeriod && isPredictedPeriodDay(date);
      const isOvulation = !hasPeriod && !isPredicted && isOvulationDay(date);
      const isFertile   = !hasPeriod && !isPredicted && !isOvulation && isFertileDay(date);

      let cls = 'calendar-day';
      if (hasPeriod)    cls += ' has-period';
      else if (isPredicted) cls += ' predicted-period';
      else if (isOvulation) cls += ' ovulation';
      else if (isFertile)   cls += ' fertile';
      else if (hasSymptom)  cls += ' has-symptoms';
      if (isToday)      cls += ' today';

      days.push(
        <div key={day} className={cls} onClick={() => handleDateClick(day)}>
          <span className="day-number">{day}</span>
          {hasPeriod    && <div className="period-dot" />}
          {isPredicted  && <div className="predicted-dot" />}
          {isOvulation  && <div className="ovulation-dot" />}
          {isFertile    && <div className="fertile-dot" />}
          {hasSymptom && !hasPeriod && !isPredicted && !isOvulation && !isFertile &&
            <div className="symptoms-dot" />}
        </div>
      );
    }
    return days;
  }, [currentDate, daysInMonth, startingDayOfWeek, periodDates, symptoms,
      isPredictedPeriodDay, isOvulationDay, isFertileDay]);

  // ─── Cycle phase logic ─────────────────────────────────────────────────────────

  // BUG FIX: getLastPeriodEndDate renamed local var to avoid shadowing component state
  const getLastPeriodEndDate = useCallback(() => {
    if (!periodDates.length) return null;
    const sorted = [...periodDates].sort();
    let prev = null;
    let end  = null;

    for (let i = sorted.length - 1; i >= 0; i--) {
      const cur = fromDateKey(sorted[i]);
      if (prev) {
        const diff = (prev - cur) / 86_400_000;
        if (diff <= 2) {
          end = cur;          // still the same period, keep going back
        } else {
          break;              // gap found — we've left the last period
        }
      }
      prev = cur;
    }

    // If we never found a gap, the whole list is one period
    return end || fromDateKey(sorted[sorted.length - 1]);
  }, [periodDates]);

  const getLastPeriodStartDate = useCallback(() => {
    if (!periodDates.length) return null;
    const sorted = [...periodDates].sort();
    // Walk backwards to find start of last continuous block
    for (let i = sorted.length - 1; i > 0; i--) {
      const diff = (fromDateKey(sorted[i]) - fromDateKey(sorted[i - 1])) / 86_400_000;
      if (diff > 2) return fromDateKey(sorted[i]);
    }
    return fromDateKey(sorted[0]);
  }, [periodDates]);

  // BUG FIX: getDaysIntoCurrentPhase now handles all phases, not just menstrual
  const getDaysIntoPhase = useCallback((phaseStartDate) => {
    if (!phaseStartDate) return 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.max(0, Math.floor((today - phaseStartDate) / 86_400_000));
  }, []);

  const getCurrentCyclePhase = useCallback(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayKey = toDateKey(today);

    // Check if currently on period
    if (periodDates.includes(todayKey)) {
      const lastStart = getLastPeriodStartDate();
      return {
        phase:       'menstrual',
        displayName: 'Menstrual Phase',
        description: 'Your period has started. This is when bleeding occurs.',
        color:       '#e91e63',
        bgColor:     '#fce4ec',
        icon:        '🩸',
        daysIntoPhase: getDaysIntoPhase(lastStart) + 1,
      };
    }

    if (prediction?.ovulationDate) {
      const ovul      = new Date(prediction.ovulationDate);
      ovul.setHours(0, 0, 0, 0);
      const lutealStart = new Date(ovul); lutealStart.setDate(ovul.getDate() + 1);
      const lastEnd   = getLastPeriodEndDate();

      if (toDateKey(today) === toDateKey(ovul)) {
        return {
          phase: 'ovulation', displayName: 'Ovulation Day',
          description: 'Egg is released! Most fertile time of your cycle.',
          color: '#ff9800', bgColor: '#fff3e0', icon: '🥚',
          daysIntoPhase: 0,
        };
      }

      if (lastEnd && today >= lastEnd && today < ovul) {
        return {
          phase: 'follicular', displayName: 'Follicular Phase',
          description: 'Egg follicles are developing in the ovaries. Energy levels may increase.',
          color: '#4caf50', bgColor: '#e8f5e9', icon: '🌱',
          daysIntoPhase: getDaysIntoPhase(lastEnd),   // BUG FIX: actually uses the phase start
        };
      }

      const lutealEnd = new Date(ovul); lutealEnd.setDate(ovul.getDate() + 14);
      if (today >= lutealStart && today <= lutealEnd) {
        return {
          phase: 'luteal', displayName: 'Luteal Phase',
          description: 'Body prepares for possible pregnancy. PMS symptoms may occur.',
          color: '#9c27b0', bgColor: '#f3e5f5', icon: '🌙',
          daysIntoPhase: getDaysIntoPhase(lutealStart),  // BUG FIX: correct phase start
        };
      }
    }

    // Fallback: estimate from last period start
    const lastStart = getLastPeriodStartDate();
    if (lastStart) {
      const daysSince = getDaysIntoPhase(lastStart);
      if (daysSince <= 5)  return { phase: 'menstrual', displayName: 'Menstrual Phase', description: 'Your period is in progress', color: '#e91e63', bgColor: '#fce4ec', icon: '🩸', daysIntoPhase: daysSince };
      if (daysSince <= 14) return { phase: 'follicular', displayName: 'Follicular Phase', description: 'Preparing for ovulation', color: '#4caf50', bgColor: '#e8f5e9', icon: '🌱', daysIntoPhase: daysSince - 5 };
      return { phase: 'luteal', displayName: 'Luteal Phase', description: 'Preparing for possible pregnancy', color: '#9c27b0', bgColor: '#f3e5f5', icon: '🌙', daysIntoPhase: daysSince - 14 };
    }

    return {
      phase: 'unknown', displayName: '❓ Unknown Phase',
      description: 'Track more cycles to see your phase predictions.',
      color: '#999', bgColor: '#f5f5f5', icon: '❓', daysIntoPhase: 0,
    };
  }, [periodDates, prediction, getLastPeriodStartDate, getLastPeriodEndDate, getDaysIntoPhase]);

  const getPhaseTips = (phase) => ({
    menstrual:  ['Rest and prioritise self-care', 'Eat iron-rich foods (leafy greens, dark chocolate)', 'Stay hydrated to reduce bloating', 'Gentle exercise like yoga or walking', 'Use heat packs for cramps'],
    follicular: ['Energy is rising — great for workouts!', 'Brain fog lifts — tackle complex tasks', 'Focus on light, fresh foods', 'Your skin may be glowing', 'Creative energy is high'],
    ovulation:  ['Highest fertility today', 'You may feel more confident and social', 'Great day for high-intensity workouts', 'Libido may be increased', 'Your communication skills are sharp'],
    luteal:     ['You may need more sleep', 'Eat complex carbs to stabilise mood', 'Practise stress-reduction techniques', 'Be kind to yourself — emotions may vary', 'Reduce caffeine if feeling anxious'],
    unknown:    ['Track your periods for personalised insights', 'Log symptoms to see patterns', 'Add your period start dates for predictions'],
  }[phase] || []);

  // ─── IUD helpers ───────────────────────────────────────────────────────────────
  const getIudStatus = () => {
    if (!iudInsertionDate) return null;
    const m = monthsUntilReplacement;
    if (m <= 0)  return { status: 'EXPIRED', message: 'Your IUD has expired and should be replaced asap',                                          color: '#ff4444' };
    if (m <= 6)  return { status: 'URGENT',  message: `Your IUD expires in ${m} month${m !== 1 ? 's' : ''}! Schedule replacement soon.`,           color: '#ff9800' };
    if (m <= 12) return { status: 'WARNING', message: `Your IUD will expire in ${m} months. Plan for replacement.`,                                 color: '#ffc107' };
    return       { status: 'OK',      message: `Your IUD is valid for ${m} more months.`,                                                           color: '#4caf50' };
  };

  const handleSetIudDate = () => {
    if (!tempIudDate) return;
    const d = new Date(tempIudDate);
    if (isNaN(d.getTime())) { alert('Please enter a valid date'); return; }
    setIudInsertionDate(d);
    calculateIudReplacement(d);
    setShowIudModal(false);
    setTempIudDate('');
  };

  const removeIudData = () => {
    setIudInsertionDate(null);
    setIudReplacementDate(null);
    setMonthsUntilReplacement(null);
    localStorage.removeItem(STORAGE_KEYS.IUD);
    setShowIudModal(false);
  };

  // ─── Calendar interaction handlers ────────────────────────────────────────────
  const handleDateClick = useCallback((day) => {
    const date    = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    const key     = toDateKey(date);
    setSelectedDate(date);
    setSelectedSymptoms(symptoms[key]?.symptoms || []);
    setNotes(symptoms[key]?.notes || '');
    setShowModal(true);
  }, [currentDate, symptoms]);

  const addPeriodDate = () => {
    if (!selectedDate) return;
    const key = toDateKey(selectedDate);
    if (!periodDates.includes(key)) setPeriodDates([...periodDates, key]);
  };

  const removePeriodDate = () => {
    if (!selectedDate) return;
    const key = toDateKey(selectedDate);
    setPeriodDates(periodDates.filter((d) => d !== key));
  };

  const saveSymptoms = () => {
    if (!selectedDate) return;
    const key = toDateKey(selectedDate);
    if (selectedSymptoms.length > 0 || notes.trim()) {
      setSymptoms({ ...symptoms, [key]: { symptoms: selectedSymptoms, notes } });
    } else {
      const updated = { ...symptoms };
      delete updated[key];
      setSymptoms(updated);
    }
    setShowModal(false);
  };

  const toggleSymptom = (symptom) => {
    setSelectedSymptoms((prev) =>
      prev.includes(symptom) ? prev.filter((s) => s !== symptom) : [...prev, symptom]
    );
  };

  const changeMonth = (inc) => {
    setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() + inc, 1));
  };

  const getMonthYearString = () =>
    currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  const daysUntilNextPeriod = useMemo(() => {
    if (!prediction?.nextPeriods[0]) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.ceil((prediction.nextPeriods[0].date - today) / 86_400_000);
  }, [prediction]);

  // ─── Sync status indicator label ──────────────────────────────────────────────
  // BUG FIX: syncStatus was tracked but never shown to the user
  const syncLabel = {
    idle:    '',
    syncing: '⏳ Syncing…',
    success: '✅ Saved',
    error:   '⚠️ Saved locally only',
  }[syncStatus];

  // ─── Derived values for render ─────────────────────────────────────────────────
  const currentPhase = getCurrentCyclePhase();
  const phaseTips    = getPhaseTips(currentPhase.phase);

  // ─────────────────────────────────────────────────────────────────────────────
  //   JSX RENDERING
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="App">
      <div className="container">

        {/* ── Header ── */}
        <header className="header">
          <h1>Period Tracker</h1>
          <p className="subtitle">Smart cycle tracking and prediction</p>
          {/* BUG FIX: sync status now visible to the user */}
          {syncLabel && <p className="sync-status">{syncLabel}</p>}
        </header>

        {/* ── Loading state ── */}
        {/* BUG FIX: show a loading message while data is being hydrated */}
        {!isLoaded && (
          <div className="loading-state">Loading your data…</div>
        )}

        {/* ── Current Cycle Phase Card ── */}
        {isLoaded && (
          <div
            className="cycle-phase-card"
            style={{ background: currentPhase.bgColor, borderColor: currentPhase.color }}
          >
            <div className="phase-header">
              <div className="phase-icon" style={{ color: currentPhase.color }}>
                {currentPhase.icon}
              </div>
              <div className="phase-info">
                <h3 className="phase-name" style={{ color: currentPhase.color }}>
                  {currentPhase.displayName}
                </h3>
                <p className="phase-description">{currentPhase.description}</p>
              </div>
            </div>

            {currentPhase.daysIntoPhase > 0 && (
              <div className="phase-progress">
                <div className="phase-progress-label">
                  Day {currentPhase.daysIntoPhase} of this phase
                </div>
                <div className="phase-progress-bar">
                  <div
                    className="phase-progress-fill"
                    style={{
                      width:      `${Math.min(100, (currentPhase.daysIntoPhase / 14) * 100)}%`,
                      background: currentPhase.color,
                    }}
                  />
                </div>
              </div>
            )}

            <div className="phase-tips">
              <strong>Tips for this phase:</strong>
              <ul>
                {phaseTips.slice(0, 3).map((tip, i) => <li key={i}>{tip}</li>)}
              </ul>
            </div>
          </div>
        )}

        {/* ── Prediction banner ── */}
        {prediction && (
          <div className="prediction-banner" onClick={() => setShowPredictionModal(true)}>
            <div className="prediction-content">
              <div className="prediction-main">
                <div>
                  <div className="prediction-title">Next Period Prediction</div>
                  <div className="prediction-date">
                    {prediction.nextPeriods[0].date.toLocaleDateString('default', {
                      month: 'long', day: 'numeric', year: 'numeric',
                    })}
                  </div>
                  {daysUntilNextPeriod !== null && (
                    <div className="prediction-days">
                      {daysUntilNextPeriod === 0
                        ? 'Expected today!'
                        : daysUntilNextPeriod < 0
                          ? `${Math.abs(daysUntilNextPeriod)} days ago`
                          : `In ${daysUntilNextPeriod} days`}
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

        {/* ── Calendar ── */}
        <div className="calendar-container">
          <div className="calendar-header">
            <button onClick={() => changeMonth(-1)} className="nav-button">←</button>
            <h2>{getMonthYearString()}</h2>
            <button onClick={() => changeMonth(1)} className="nav-button">→</button>
            <button onClick={() => setCurrentDate(new Date())} className="today-button">Today</button>
          </div>

          <div className="calendar-weekdays">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="weekday">{d}</div>
            ))}
          </div>

          <div className="calendar-grid">{calendarDays}</div>
        </div>

        {/* ── Legend ── */}
        <div className="legend">
          <div className="legend-item"><span className="legend-label-period">Period day</span></div>
          <div className="legend-item"><span className="legend-label-predicted">Predicted period</span></div>
          <div className="legend-item"><span className="legend-label-ovulation">Ovulation day</span></div>
          <div className="legend-item"><span className="legend-label-fertile">Fertile window</span></div>
          <div className="legend-item"><span className="legend-label-symptoms">Symptoms tracked</span></div>
        </div>

        {/* ── IUD Modal ── */}
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
                  <button onClick={removeIudData} className="btn-remove-iud">Remove IUD Data</button>
                </div>
              )}
              <div className="modal-buttons">
                <button onClick={handleSetIudDate} className="btn-save">
                  {iudInsertionDate ? 'Update Date' : 'Save Date'}
                </button>
                <button onClick={() => setShowIudModal(false)} className="btn-cancel">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Day detail Modal ── */}
        {showModal && selectedDate && (
          <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h3>
                {selectedDate.toLocaleDateString('default', {
                  month: 'long', day: 'numeric', year: 'numeric',
                })}
              </h3>

              <div className="period-section">
                <h4>Period Tracking</h4>
                <div className="button-group">
                  <button onClick={addPeriodDate}    className="btn-add">Add Period Day</button>
                  <button onClick={removePeriodDate} className="btn-remove">Remove Period</button>
                </div>
                {periodDates.includes(toDateKey(selectedDate)) && (
                  <p className="period-status">✓ Period recorded for this day</p>
                )}
              </div>

              <div className="symptoms-section">
                <h4>Symptoms</h4>
                <div className="symptoms-grid">
                  {symptomOptions.map((s) => (
                    <button
                      key={s}
                      className={`symptom-button ${selectedSymptoms.includes(s) ? 'active' : ''}`}
                      onClick={() => toggleSymptom(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="notes-section">
                <h4>Notes</h4>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any additional notes…"
                  rows="3"
                />
              </div>

              <div className="modal-buttons">
                <button onClick={saveSymptoms}           className="btn-save">Save</button>
                <button onClick={() => setShowModal(false)} className="btn-cancel">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Prediction details Modal ── */}
        {showPredictionModal && prediction && (
          <div className="modal-overlay" onClick={() => setShowPredictionModal(false)}>
            <div className="modal-content prediction-modal" onClick={(e) => e.stopPropagation()}>
              <h3>Detailed Cycle Analysis</h3>

              <div className="prediction-section">
                <h4>Cycle Statistics</h4>
                <div className="stats-grid">
                  {[
                    ['Average Cycle Length',  `${prediction.statistics.avgCycleLength} days`],
                    ['Median Cycle Length',   `${prediction.statistics.medianCycleLength} days`],
                    ['Standard Deviation',    `±${prediction.statistics.stdDev} days`],
                    ['Average Duration',      `${prediction.statistics.avgDuration} days`],
                    ['Cycles Tracked',        prediction.statistics.cycleCount],
                    ['Regularity',            prediction.statistics.regularity],
                  ].map(([label, value]) => (
                    <div key={label} className="stat-item">
                      <div className="stat-label">{label}</div>
                      <div className="stat-value">{value}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="prediction-details">
                <div className="prediction-section">
                  <h4>Next 3 Period Predictions</h4>
                  {prediction.nextPeriods.map((period, i) => (
                    <div key={i} className="prediction-item">
                      <strong>Period {i + 1}:</strong>{' '}
                      {period.date.toLocaleDateString('default', {
                        month: 'long', day: 'numeric', year: 'numeric',
                      })}
                      <span className={`confidence-badge ${period.confidence.toLowerCase().replace(' ', '-')}`}>
                        {period.confidence} confidence
                      </span>
                    </div>
                  ))}
                </div>

                {/* IUD section */}
                <div className="iud-section">
                  <div className="iud-header">
                    <h4>IUD Information</h4>
                    <button
                      onClick={() => setShowIudModal(true)}
                      className={iudInsertionDate ? 'btn-edit-iud' : 'btn-add-iud'}
                    >
                      {iudInsertionDate ? 'Edit' : '+ Add IUD Date'}
                    </button>
                  </div>

                  {iudInsertionDate ? (
                    <div className="iud-details">
                      <div className="iud-date">
                        <strong>Insertion Date:</strong>{' '}
                        {iudInsertionDate.toLocaleDateString('default', {
                          month: 'long', day: 'numeric', year: 'numeric',
                        })}
                      </div>
                      <div className="iud-replacement">
                        <strong>Replace by:</strong>{' '}
                        {iudReplacementDate?.toLocaleDateString('default', {
                          month: 'long', day: 'numeric', year: 'numeric',
                        })}
                      </div>
                      <div className="iud-countdown">
                        <strong>Time remaining:</strong>{' '}
                        <span className={`iud-status ${getIudStatus()?.status.toLowerCase()}`}>
                          {getIudStatus()?.message}
                        </span>
                      </div>
                      <div className="iud-progress">
                        <div className="iud-progress-bar">
                          <div
                            className="iud-progress-fill"
                            style={{
                              width:           `${Math.max(0, Math.min(100, ((96 - (monthsUntilReplacement || 0)) / 96) * 100))}%`,
                              backgroundColor: getIudStatus()?.color,
                            }}
                          />
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
                    <div>
                      <strong>Ovulation:</strong>{' '}
                      {prediction.ovulationDate.toLocaleDateString('default', {
                        month: 'long', day: 'numeric', year: 'numeric',
                      })}
                    </div>
                    <div>
                      <strong>Fertile Window:</strong>{' '}
                      {prediction.fertileWindow.start.toLocaleDateString('default', { month: 'long', day: 'numeric' })}
                      {' – '}
                      {prediction.fertileWindow.end.toLocaleDateString('default', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </div>
                  </div>
                </div>

                {prediction.predictedSymptoms.length > 0 && (
                  <div className="prediction-section">
                    <h4>Likely Symptoms Next Period</h4>
                    <div className="symptoms-prediction">
                      {prediction.predictedSymptoms.map((s, i) => (
                        <div key={i} className="symptom-probability">
                          <span>{s.symptom}</span>
                          <div className="probability-bar">
                            <div className="probability-fill" style={{ width: `${s.probability}%` }} />
                          </div>
                          <span className="probability-value">{Math.round(s.probability)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="prediction-section">
                  <h4>Prediction Confidence</h4>
                  <div className="confidence-interval">
                    <div>
                      95% Confidence Interval:{' '}
                      {prediction.confidenceInterval.lower} – {prediction.confidenceInterval.upper} days
                    </div>
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