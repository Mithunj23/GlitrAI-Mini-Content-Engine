const API_BASE = '/api';

const form = document.getElementById('generate-form');
const submitBtn = document.getElementById('submit-btn');
const formError = document.getElementById('form-error');
const jobsListEl = document.getElementById('jobs-list');
const resultViewEl = document.getElementById('result-view');
const imageInput = document.getElementById('image-input');
const preview = document.getElementById('preview');
const fileHint = document.getElementById('file-hint');
const refreshBtn = document.getElementById('refresh-btn');

let jobs = [];
let selectedJobId = null;
let pollTimer = null;

imageInput.addEventListener('change', () => {
  const file = imageInput.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  preview.src = url;
  preview.hidden = false;
  fileHint.textContent = file.name;
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  formError.hidden = true;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting…';

  try {
    const fd = new FormData(form);
    const res = await fetch(`${API_BASE}/generate`, { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to submit job');

    form.reset();
    preview.hidden = true;
    fileHint.textContent = 'Click to choose an image, or drag one here';

    selectedJobId = data.id;
    await refreshJobs();
  } catch (err) {
    formError.textContent = err.message;
    formError.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Generate creative →';
  }
});

refreshBtn.addEventListener('click', refreshJobs);

async function refreshJobs() {
  try {
    const res = await fetch(`${API_BASE}/jobs`);
    jobs = await res.json();
    renderJobsList();
    if (selectedJobId) renderResult(selectedJobId);
  } catch (err) {
    console.error('Failed to fetch jobs', err);
  }
}

function statusLabel(status) {
  return status.toUpperCase();
}

function renderJobsList() {
  if (jobs.length === 0) {
    jobsListEl.innerHTML = '<p class="empty-state">No jobs yet — submit a product on the left to kick off the pipeline.</p>';
    return;
  }

  jobsListEl.innerHTML = jobs
    .map((job) => {
      const active = job.id === selectedJobId ? 'active' : '';
      return `
      <div class="job-ticket ${active}" data-id="${job.id}">
        <div class="job-ticket__top">
          <div>
            <div class="job-ticket__name">${escapeHtml(job.productName)}</div>
            <div class="job-ticket__id">#${job.id.slice(0, 8)}</div>
          </div>
          <span class="stamp stamp--${job.status}">${statusLabel(job.status)}</span>
        </div>
        <div class="job-ticket__desc">${escapeHtml(job.description)}</div>
      </div>`;
    })
    .join('');

  jobsListEl.querySelectorAll('.job-ticket').forEach((el) => {
    el.addEventListener('click', () => {
      selectedJobId = el.dataset.id;
      renderJobsList();
      renderResult(selectedJobId);
    });
  });
}

function renderResult(jobId) {
  const job = jobs.find((j) => j.id === jobId);
  if (!job) {
    resultViewEl.innerHTML = '<p class="empty-state">Select a job from the queue to inspect its prompt and output.</p>';
    return;
  }

  const promptBlock = job.generatedPrompt
    ? `<div class="result-block">
         <div class="result-block__label">LLM-generated prompt</div>
         <div class="result-block__body">${escapeHtml(job.generatedPrompt)}</div>
       </div>`
    : `<div class="result-block"><div class="result-block__label">LLM-generated prompt</div><div class="result-block__body">Waiting…</div></div>`;

  let statusBlock = '';
  if (job.status === 'failed') {
    statusBlock = `<div class="result-block"><div class="result-block__label">Error</div><div class="result-block__body">${escapeHtml(job.errorMessage || 'Unknown error')}</div></div>`;
  }

  let imagesBlock = '<p class="empty-state">Render still in progress — this panel updates automatically.</p>';
  if (job.status === 'completed' || job.referenceImageUrl) {
    imagesBlock = `
      <div class="result-images">
        ${
          job.referenceImageUrl
            ? `<figure><img src="${job.referenceImageUrl}" alt="reference" /><figcaption>Reference input</figcaption></figure>`
            : ''
        }
        ${
          job.resultImageUrl
            ? `<figure><img src="${job.resultImageUrl}" alt="result" /><figcaption>Generated output</figcaption></figure>`
            : ''
        }
      </div>`;
  }

  resultViewEl.innerHTML = `
    <h3>${escapeHtml(job.productName)} <span class="stamp stamp--${job.status}">${statusLabel(job.status)}</span></h3>
    ${promptBlock}
    ${statusBlock}
    ${imagesBlock}
  `;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(refreshJobs, 3000);
}

refreshJobs();
startPolling();
