import {bootstrapStudentAnalytics} from './student-analytics';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

bootstrapStudentAnalytics(document,window.location.href,import.meta.env.DEV);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
);
