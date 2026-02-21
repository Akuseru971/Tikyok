# Tikyok — Private YouTube Theory Voiceover Tool

Private web app (not SaaS) that takes a YouTube URL, downloads the video, transcribes it, detects major theories/topics, rewrites each segment faithfully, generates ElevenLabs voiceover, and renders a final MP4 for subtitle insertion (e.g., CapCut).

## Stack

- Backend: Node.js, Express.js, FFmpeg, yt-dlp, OpenAI (Whisper + GPT-4o), ElevenLabs, Multer, UUID
- Frontend: Next.js 14 (App Router), TypeScript, TailwindCSS
- Deploy: Railway or Dockerized VPS (not Vercel)

## Project Structure

```
/backend
	server.js
	/services
		downloadService.js
		transcriptionService.js
		segmentationService.js
		rewriteService.js
		elevenService.js
		ffmpegService.js
	/routes
		processVideo.js
	/utils
		fileManager.js
/frontend
	/app
		page.tsx
	/components
		Dashboard.tsx
		ProgressBar.tsx
		SegmentList.tsx
.env.example
Dockerfile
README.md
```

## Environment Variables

Copy `.env.example` to `.env` and fill:

```
OPENAI_API_KEY=
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
BACKEND_PORT=4000
YTDLP_COOKIES_FILE=
YTDLP_COOKIES=
BACKEND_URL=
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
```

`BACKEND_URL` is used by Next.js rewrites (frontend server-side proxy). Set it on frontend deploys when backend runs on a different host.

## Local Setup

### 1) System dependencies

Ubuntu/Debian:

```bash
sudo apt-get update
sudo apt-get install -y ffmpeg python3 python3-pip
pip3 install --break-system-packages yt-dlp
```

Check:

```bash
ffmpeg -version
yt-dlp --version
```

### 2) Install app dependencies

```bash
npm install
npm --prefix backend install
npm --prefix frontend install
```

### 3) Run in development

```bash
npm run dev
```

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:4000`

## API Usage Flow

### Start processing

`POST /api/process-video`

JSON body:

```json
{
	"youtubeUrl": "https://youtube.com/..."
}
```

Response:

```json
{
	"jobId": "uuid",
	"status": "queued"
}
```

### Poll status

`GET /api/job/:jobId`

Returns job status, progress, detected theories, and `downloadUrl` when complete.

## Processing Pipeline

1. Download video with `yt-dlp` into `/tmp/tikyok-jobs/{jobId}/original.mp4`
2. Extract mono WAV with FFmpeg
3. Transcribe with Whisper (`whisper-1`) with segment and word timestamps
4. Detect major distinct theories/topics using `gpt-4o`
5. Rewrite each theory segment with ~95% fidelity (length preserved ±5%)
6. Generate segment-level ElevenLabs voiceovers (`eleven_english_v2`)
7. Rebuild timeline audio to match segment timing
8. Replace original audio track and export final MP4

## Docker (VPS / Railway-compatible image)

Build:

```bash
docker build -t tikyok:latest .
```

Run:

```bash
docker run --rm -p 3000:3000 -p 4000:4000 --env-file .env tikyok:latest
```

## Railway Deployment

Recommended: deploy as **2 services** from same repo.

1. **Backend service**
	 - Root directory: `backend`
	 - Build command: `npm install`
	 - Start command: `npm run start`
	 - Add env vars: `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `BACKEND_PORT=4000`, and optionally `YTDLP_COOKIES_FILE` or `YTDLP_COOKIES` (recommended for YouTube bot checks)
2. **Frontend service**
	 - Root directory: `frontend`
	 - Build command: `npm install && npm run build`
	 - Start command: `npm run start`
	 - Add env vars: `BACKEND_URL=<public backend URL>`, `NEXT_PUBLIC_API_BASE_URL=<public backend URL>`

If you prefer one container, use the provided Dockerfile on Railway with Docker deployment.

## Error Handling

Structured errors are returned for:

- Invalid YouTube URL (`INVALID_YOUTUBE_URL`)
- yt-dlp failure (`YTDLP_FAILED`)
- Transcription failure (`TRANSCRIPTION_FAILED`)
- GPT segmentation/rewrite issues (`SEGMENTATION_FAILED`, `REWRITE_FAILED`)
- ElevenLabs failures (`ELEVENLABS_API_FAILED`, `ELEVENLABS_FAILED`)
- FFmpeg failures (`FFMPEG_*`)

## Troubleshooting

- `yt-dlp: command not found`
	- Install with `pip3 install --break-system-packages yt-dlp`
- `Sign in to confirm you're not a bot`
	- Set backend env `YTDLP_COOKIES_FILE` (path) or `YTDLP_COOKIES` (raw Netscape cookies content) from a logged-in browser export
	- If needed, use uploaded `videoFile` input instead of YouTube URL
- `FFmpeg failed`
	- Verify `ffmpeg -version`, ensure disk space in `/tmp`
- `OpenAI 401/429`
	- Check `OPENAI_API_KEY`, quotas, and rate limits
- `ElevenLabs error`
	- Verify `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID`
- Stuck job
	- Poll `/api/job/:jobId` and inspect backend logs

## Notes

- This is a private internal workflow tool.
- Audio currently fully replaces the original voice track (music preservation is optional enhancement).