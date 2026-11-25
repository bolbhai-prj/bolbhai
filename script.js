
'use strict';

const $ = id => document.getElementById(id);
const loginForm = $('loginForm'), mobileInput = $('mobileNumber'), passwordInput = $('password'), loginError = $('loginError');
const app = $('app'), loginCard = $('loginCard');
const languageSelect = $('languageSelect'), micButton = $('micButton'), voiceStatus = $('voiceStatus'), waveform = $('waveform');
const paidTotal = $('paidTotal'), pendingTotal = $('pendingTotal'), paidList = $('paidList'), pendingList = $('pendingList');
const customerSearch = $('customerSearch'), customerProfile = $('customerProfile'), profileContent = $('profileContent');
const recordsSection = document.querySelector('.records-section'), searchSection = document.querySelector('.search-section');
const STORAGE_PREFIX = 'bolbahiAccount_';

let currentMobile = null, transactions = [], selectedCustomer = null;

// Demo-only local account system.
// It stores data in this browser, not a secure server.
function accountKey(mobile) {
  return STORAGE_PREFIX + mobile;
}

function loadAccount(mobile) {
  const raw = localStorage.getItem(accountKey(mobile));
  return raw ? JSON.parse(raw) : null;
}

function saveAccount() {
  if (!currentMobile) return;

  const account = loadAccount(currentMobile);
  if (!account) return;

  account.transactions = transactions;
  localStorage.setItem(accountKey(currentMobile), JSON.stringify(account));
}

function showApp(mobile) {
  currentMobile = mobile;

  const account = loadAccount(mobile);
  transactions = account.transactions || [];

  loginCard.hidden = true;
  app.hidden = false;

  renderDashboard();
}

loginForm.addEventListener('submit', event => {
  event.preventDefault();

  const mobile = mobileInput.value.trim();
  const password = passwordInput.value;

  loginError.textContent = '';

  if (!/^\d{10}$/.test(mobile)) {
    loginError.textContent = 'Enter a valid 10-digit mobile number.';
    return;
  }

  if (password.length < 4) {
    loginError.textContent = 'Password must contain at least 4 characters.';
    return;
  }

  let account = loadAccount(mobile);

  if (!account) {
    account = {
      password,
      transactions: []
    };

    localStorage.setItem(accountKey(mobile), JSON.stringify(account));
  } else if (account.password !== password) {
    loginError.textContent = 'Incorrect mobile number or password.';
    return;
  }

  sessionStorage.setItem('bolbahiActiveMobile', mobile);
  showApp(mobile);
});

$('logoutButton').addEventListener('click', () => {
  sessionStorage.removeItem('bolbahiActiveMobile');

  currentMobile = null;
  transactions = [];

  app.hidden = true;
  loginCard.hidden = false;
  passwordInput.value = '';
});

const activeMobile = sessionStorage.getItem('bolbahiActiveMobile');

if (activeMobile && loadAccount(activeMobile)) {
  showApp(activeMobile);
}

function getDateTime(transaction) {
  return transaction.timestamp
    ? new Date(transaction.timestamp).toLocaleString('en-IN')
    : 'Date unavailable';
}

function speakMessage(message, language) {
  if (!('speechSynthesis' in window)) return;

  const synth = window.speechSynthesis;
  synth.cancel();

  const utterance = new SpeechSynthesisUtterance(message);
  utterance.lang = language;
  utterance.rate = .85;

  const voice = synth.getVoices().find(
    v => v.lang.toLowerCase() === language.toLowerCase()
  );

  if (voice) utterance.voice = voice;

  setTimeout(() => synth.speak(utterance), 250);
}

function convertDigits(text) {
  return text.replace(/[०-९೦-೯]/g, d => {
    const hindi = '०१२३४५६७८९'.indexOf(d);

    if (hindi >= 0) return String(hindi);

    const kannada = '೦೧೨೩೪೫೬೭೮೯'.indexOf(d);
    return String(kannada);
  });
}

function detectType(text) {
  const s = text.toLowerCase();

  const paidWords = [
    'paid', 'payment', 'जमा', 'भुगतान', 'पेमेंट', 'चुकता',
    'ಪಾವತಿ', 'ಹಣ ಪಾವತಿ', 'ಚುಕ್ತಾ'
  ];

  const pendingWords = [
    'pending', 'due', 'बाकी', 'बकाया', 'उधार', 'ಬಾಕಿ', 'ಸಾಲ'
  ];

  const paid = paidWords.some(w => s.includes(w));
  const pending = pendingWords.some(w => s.includes(w));

  if (paid && pending) return null;

  return paid ? 'paid' : pending ? 'pending' : null;
}

function extractAmount(text) {
  const matches = convertDigits(text).match(/\d+(?:\.\d+)?/g);

  return matches ? Number(matches[0]) : null;
}

function extractName(text) {
  let cleaned = convertDigits(text).replace(/\d+(?:\.\d+)?/g, ' ');

  const words = [
    'add', 'record', 'customer', 'gave', 'give', 'rupees', 'rs',
    'rupay', 'rupee', 'to', 'for', 'amount', 'is', 'was', 'in',
    'paid', 'payment', 'pending', 'due', 'को', 'का', 'की', 'के',
    'रुपये', 'रुपया', 'रु', 'रकम', 'दर्ज', 'करो', 'कर', 'जोड़ो',
    'ग्राहक', 'खाते', 'में', 'हैं', 'था', 'कीजिए', 'जमा', 'भुगतान',
    'पेमेंट', 'चुकता', 'पावती', 'बाकी', 'बकाया', 'उधार', 'ಹಣ',
    'ರೂಪಾಯಿ', 'ರೂಪಾಯಿಗಳು', 'ಗ್ರಾಹಕ', 'ನಮೂದಿಸಿ', 'ಗೆ', 'ಇದೆ',
    'ಮಾಡಿ', 'ಪಾವತಿ', 'ಹಣ ಪಾವತಿ', 'ಚುಕ್ತಾ', 'ಬಾಕಿ', 'ಸಾಲ'
  ];

  for (const word of words) {
    cleaned = cleaned.replace(
      new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
      ' '
    );
  }

  return cleaned
    .replace(/[.,!?;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map(p => /^[a-z]/i.test(p)
      ? p[0].toUpperCase() + p.slice(1).toLowerCase()
      : p
    )
    .join(' ');
}

function processTransaction(text, language) {
  const amount = extractAmount(text);
  const type = detectType(text);
  const name = extractName(text);

  if (!amount || amount <= 0) {
    voiceStatus.textContent = 'Amount not detected.';
    speakMessage('Please say the amount clearly', language);
    return;
  }

  if (!type) {
    voiceStatus.textContent = 'Say paid or pending.';
    speakMessage('Please say paid or pending', language);
    return;
  }

  if (!name) {
    voiceStatus.textContent = 'Customer name not detected.';
    speakMessage('Please say the customer name', language);
    return;
  }

  if (type === 'pending') {
    transactions.push({
      id: Date.now(),
      name,
      amount,
      type,
      timestamp: Date.now()
    });
  } else {
    applyPayment(name, amount);
  }

  saveAccount();
  renderDashboard();

  voiceStatus.textContent =
    `${name}: ₹${amount.toLocaleString('en-IN')} ${type} recorded successfully.`;

  speakMessage(
    type === 'paid'
      ? 'Payment recorded successfully'
      : 'Pending amount recorded',
    language
  );
}

function applyPayment(customerName, amount) {
  let remaining = amount;

  const dues = transactions
    .filter(t =>
      t.type === 'pending' &&
      t.name.toLowerCase() === customerName.toLowerCase()
    )
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  for (const t of dues) {
    if (remaining <= 0) break;

    const payment = Math.min(t.amount, remaining);
    t.amount -= payment;
    remaining -= payment;
  }

  transactions = transactions.filter(
    t => t.type !== 'pending' || t.amount > 0
  );

  transactions.push({
    id: Date.now(),
    name: customerName,
    amount,
    type: 'paid',
    timestamp: Date.now()
  });
}

function groupTransactions(type) {
  const groups = {};

  transactions
    .filter(t => t.type === type)
    .forEach(t => {
      const key = t.name.toLowerCase();

      if (!groups[key]) {
        groups[key] = {
          name: t.name,
          transactions: [],
          total: 0
        };
      }

      groups[key].transactions.push(t);
      groups[key].total += t.amount;
    });

  return Object.values(groups);
}

function filterGroups(groups) {
  const term = customerSearch.value.trim().toLowerCase();

  return term
    ? groups.filter(c => c.name.toLowerCase().includes(term))
    : groups;
}

function renderCustomerList(element, type) {
  const groups = filterGroups(groupTransactions(type));

  element.replaceChildren();

  if (!groups.length) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = `No ${type} records found.`;
    element.appendChild(p);
    return;
  }

  groups.forEach(customer => {
    const card = document.createElement('div');
    card.className = 'customer-card';

    const header = document.createElement('div');
    header.className = 'customer-header';

    const name = document.createElement('span');
    name.className = 'customer-name';
    name.textContent = customer.name;

    const amount = document.createElement('span');
    amount.className = 'customer-amount';
    amount.textContent = '₹' + customer.total.toLocaleString('en-IN');

    header.append(name, amount);
    card.appendChild(header);

    const history = document.createElement('div');
    history.className = 'transaction-history';

    customer.transactions
      .slice(-3)
      .reverse()
      .forEach(t => {
        const row = document.createElement('div');
        row.className = 'transaction-row';

        const detail = document.createElement('span');
        detail.textContent = '₹' + t.amount.toLocaleString('en-IN');

        const date = document.createElement('span');
        date.className = 'transaction-date';
        date.textContent = getDateTime(t);

        row.append(detail, date);
        history.appendChild(row);
      });

    card.appendChild(history);

    const status = document.createElement('div');
    status.className = type === 'paid' ? 'paid-text' : 'pending-text';
    status.textContent = type === 'paid' ? 'Paid' : 'Pending';

    card.appendChild(status);

    if (type === 'pending') {
      const settle = document.createElement('button');
      settle.className = 'settle-button';
      settle.type = 'button';
      settle.textContent = 'Mark Paid';

      settle.addEventListener('click', e => {
        e.stopPropagation();
        settleCustomer(customer.name);
      });

      card.appendChild(settle);
    }

    card.addEventListener('click', () => openCustomerProfile(customer.name));

    element.appendChild(card);
  });
}

function renderDashboard() {
  paidTotal.textContent = '₹' + transactions
    .filter(t => t.type === 'paid')
    .reduce((s, t) => s + t.amount, 0)
    .toLocaleString('en-IN');

  pendingTotal.textContent = '₹' + transactions
    .filter(t => t.type === 'pending')
    .reduce((s, t) => s + t.amount, 0)
    .toLocaleString('en-IN');

  renderCustomerList(paidList, 'paid');
  renderCustomerList(pendingList, 'pending');
}

function settleCustomer(name) {
  const due = transactions.filter(
    t => t.type === 'pending' &&
    t.name.toLowerCase() === name.toLowerCase()
  );

  if (!due.length) return;

  const total = due.reduce((s, t) => s + t.amount, 0);

  applyPayment(name, total);
  saveAccount();
  renderDashboard();

  voiceStatus.textContent =
    `${name} paid ₹${total.toLocaleString('en-IN')} successfully.`;

  speakMessage('Payment successful', languageSelect.value);
}

function createStatBox(labelText, amountText, colorClass) {
  const box = document.createElement('div');
  box.className = 'profile-stat';

  const label = document.createElement('h3');
  label.textContent = labelText;

  const value = document.createElement('p');
  value.className = colorClass;
  value.textContent = amountText;

  box.append(label, value);

  return box;
}

function renderCustomerProfile(name) {
  const list = transactions.filter(
    t => t.name.toLowerCase() === name.toLowerCase()
  );

  const paid = list
    .filter(t => t.type === 'paid')
    .reduce((s, t) => s + t.amount, 0);

  const pending = list
    .filter(t => t.type === 'pending')
    .reduce((s, t) => s + t.amount, 0);

  profileContent.replaceChildren();

  const heading = document.createElement('h2');
  heading.className = 'profile-heading';
  heading.textContent = name;

  profileContent.appendChild(heading);

  const summary = document.createElement('div');
  summary.className = 'profile-summary';

  summary.append(
    createStatBox(
      'Total Paid',
      '₹' + paid.toLocaleString('en-IN'),
      'paid-text'
    ),
    createStatBox(
      'Remaining Pending',
      '₹' + pending.toLocaleString('en-IN'),
      'pending-text'
    )
  );

  profileContent.appendChild(summary);

  const title = document.createElement('h3');
  title.className = 'profile-history-title';
  title.textContent = 'Account History';

  profileContent.appendChild(title);

  const sorted = [...list].sort(
    (a, b) => (b.timestamp || 0) - (a.timestamp || 0)
  );

  if (!sorted.length) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'No transactions found.';
    profileContent.appendChild(p);
  }

  sorted.forEach(t => {
    const row = document.createElement('div');
    row.className = 'profile-transaction';

    const top = document.createElement('div');
    top.className = 'profile-transaction-top';

    const label = document.createElement('strong');
    label.textContent = t.type === 'paid'
      ? 'Payment Received'
      : 'Amount Added';

    const amount = document.createElement('strong');
    amount.className = t.type === 'paid'
      ? 'paid-text'
      : 'pending-text';

    amount.textContent = '₹' + t.amount.toLocaleString('en-IN');

    top.append(label, amount);

    const date = document.createElement('div');
    date.className = 'profile-transaction-date';
    date.textContent = getDateTime(t);

    row.append(top, date);
    profileContent.appendChild(row);
  });

  if (pending > 0) {
    const button = document.createElement('button');
    button.className = 'settle-button';
    button.textContent = 'Mark Full Balance Paid';

    button.addEventListener('click', () => {
      settleCustomer(name);
      renderCustomerProfile(name);
    });

    profileContent.appendChild(button);
  }
}

function openCustomerProfile(name) {
  selectedCustomer = name;

  recordsSection.hidden = true;
  searchSection.hidden = true;
  customerProfile.hidden = false;

  renderCustomerProfile(name);

  window.scrollTo({
    top: customerProfile.offsetTop - 20,
    behavior: 'smooth'
  });
}

$('backToCustomers').addEventListener('click', () => {
  selectedCustomer = null;

  customerProfile.hidden = true;
  recordsSection.hidden = false;
  searchSection.hidden = false;

  renderDashboard();

  window.scrollTo({
    top: searchSection.offsetTop - 20,
    behavior: 'smooth'
  });
});

customerSearch.addEventListener('input', renderDashboard);

$('clearButton').addEventListener('click', () => {
  if (confirm('Are you sure you want to clear all records for this account?')) {
    transactions = [];

    saveAccount();
    renderDashboard();

    customerProfile.hidden = true;
    recordsSection.hidden = false;
    searchSection.hidden = false;

    voiceStatus.textContent = 'All records cleared.';
  }
});

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

if (!SpeechRecognition) {
  voiceStatus.textContent =
    'Speech recognition is not supported in this browser. Try Chrome.';

  micButton.disabled = true;
} else {
  const recognition = new SpeechRecognition();

  recognition.continuous = false;
  recognition.interimResults = false;

  micButton.addEventListener('click', () => {
    recognition.lang = languageSelect.value;

    try {
      recognition.start();
    } catch (e) {
      voiceStatus.textContent = 'Microphone is already active.';
    }
  });

  recognition.onstart = () => {
    voiceStatus.textContent = 'Listening...';
    waveform.classList.add('active');
    micButton.classList.add('listening');
  };

  recognition.onresult = e => {
    const spoken = e.results[0][0].transcript;

    voiceStatus.textContent = 'Heard: ' + spoken;

    processTransaction(spoken, languageSelect.value);
  };

  recognition.onerror = e => {
    voiceStatus.textContent = 'Voice error: ' + e.error;
  };

  recognition.onend = () => {
    waveform.classList.remove('active');
    micButton.classList.remove('listening');
  };
}
