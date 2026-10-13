const express = require("express");
const path = require("path");
const fs = require("fs");
const { Readable } = require("stream");
const { getTweet } = require("react-tweet/api");
const ffmpeg = require("fluent-ffmpeg");

let isFfmpegAvailable = false;
try {
  const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
  if (ffmpegInstaller && ffmpegInstaller.path) {
    ffmpeg.setFfmpegPath(ffmpegInstaller.path);
    isFfmpegAvailable = true;
  }
} catch (e) {
  console.warn("[FFmpeg Setup Warning]:", e.message);
}

const app = express();
const port = Number(process.env.PORT) || 3000;
const publicRoot = path.join(__dirname, "public");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/how-to-download-facebook-videos.html", (req, res) => {
  res.redirect(301, "/how-to-download-twitter-videos.html");
});

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getCleanFilename(rawTitle) {
  let clean = (rawTitle || "Twitter_Video")
    .replace(/[\r\n]+/g, " ")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[/\\?%*:|"<>]/g, "_")
    .replace(/\s+/g, "_")
    .trim();
  if (clean.length > 60) clean = clean.slice(0, 60).trim();
  return clean || "Twitter_Video";
}

// Extract Tweet ID from any Twitter / X URL or raw numeric ID
function extractTweetId(input) {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();
  if (/^\d{8,25}$/.test(trimmed)) {
    return trimmed;
  }
  const match = trimmed.match(/(?:status|tweets)\/(\d+)/i);
  if (match) {
    return match[1];
  }
  return null;
}

// Parse resolution label from URL and bitrate
function getVariantLabel(url, bitrate) {
  const match = url.match(/\/(\d+)x(\d+)\//);
  if (match) {
    const w = parseInt(match[1], 10);
    const h = parseInt(match[2], 10);
    const maxDim = Math.max(w, h);
    const minDim = Math.min(w, h);
    let tag = `${w}x${h}`;
    if (minDim >= 720 || maxDim >= 1280) {
      tag += " (HD)";
    }
    return tag;
  }
  if (bitrate >= 2000000) return "1280x720 (HD)";
  if (bitrate >= 800000) return "640x360";
  if (bitrate >= 250000) return "480x270";
  return "MP4 Video";
}

// Parse duration helper
function formatDuration(ms) {
  if (!ms || typeof ms !== "number") return null;
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

// Fetch and extract video details using Twitter Syndication CDN (react-tweet)
async function extractTwitterVideo(tweetId) {
  const tweet = await getTweet(tweetId);
  if (!tweet) {
    throw new Error("Tweet not found or is private/deleted.");
  }

  let variants = [];
  let thumbnail = "";
  let durationMs = null;
  const title = tweet.text || "Twitter Video";
  const author = tweet.user ? `${tweet.user.name} (@${tweet.user.screen_name})` : "Twitter User";

  // 1. Direct video variants
  if (tweet.video && Array.isArray(tweet.video.variants)) {
    variants.push(...tweet.video.variants);
    if (tweet.video.durationMs) durationMs = tweet.video.durationMs;
  }

  // 2. Media details
  if (Array.isArray(tweet.mediaDetails)) {
    for (const m of tweet.mediaDetails) {
      if (m.video_info && Array.isArray(m.video_info.variants)) {
        variants.push(...m.video_info.variants);
      }
      if (m.video_info && typeof m.video_info.duration_millis === "number" && !durationMs) {
        durationMs = m.video_info.duration_millis;
      }
      if (m.media_url_https && !thumbnail) {
        thumbnail = m.media_url_https;
      }
    }
  }

  // 3. Card binding values (Unified Card)
  if (tweet.card && tweet.card.binding_values && tweet.card.binding_values.unified_card) {
    try {
      const ucStr = tweet.card.binding_values.unified_card.string_value;
      if (ucStr) {
        const uc = JSON.parse(ucStr);
        if (uc.media_entities) {
          for (const key of Object.keys(uc.media_entities)) {
            const me = uc.media_entities[key];
            if (me.video_info && Array.isArray(me.video_info.variants)) {
              variants.push(...me.video_info.variants);
            }
            if (me.video_info && typeof me.video_info.duration_millis === "number" && !durationMs) {
              durationMs = me.video_info.duration_millis;
            }
            if (me.media_url_https && !thumbnail) {
              thumbnail = me.media_url_https;
            }
          }
        }
      }
    } catch (e) {
      // ignore json parse error
    }
  }

  // Filter only valid MP4s and remove duplicates
  const seenUrls = new Set();
  const mp4s = [];
  for (const v of variants) {
    if (v && v.url && v.content_type === "video/mp4" && !seenUrls.has(v.url)) {
      seenUrls.add(v.url);
      mp4s.push({
        url: v.url,
        bitrate: typeof v.bitrate === "number" ? v.bitrate : 0
      });
    }
  }

  // Sort by bitrate descending (highest quality first)
  mp4s.sort((a, b) => b.bitrate - a.bitrate);

  if (mp4s.length === 0) {
    throw new Error("No downloadable video found in this tweet. Please make sure the post contains a video.");
  }

  const cleanBase = getCleanFilename(title);

  const formattedVariants = mp4s.map((item) => {
    const bitrateKbps = item.bitrate ? Math.round(item.bitrate / 1000) : "";
    const cleanQuality = bitrateKbps || getVariantLabel(item.url, item.bitrate);
    const filename = `${cleanBase}_${cleanQuality}.mp4`;
    return {
      url: item.url,
      bitrate: item.bitrate,
      bitrateKbps: cleanQuality,
      label: cleanQuality,
      filename
    };
  });

  return {
    id: tweetId,
    title,
    authorName: tweet.user ? tweet.user.name : "Twitter User",
    authorHandle: tweet.user ? `@${tweet.user.screen_name}` : "",
    thumbnail: thumbnail || "img/twitter-video-downloader-online.png",
    duration: formatDuration(durationMs) || "00:20",
    hdUrl: mp4s[0].url,
    sdUrl: mp4s[mp4s.length - 1].url,
    variants: formattedVariants
  };
}

// Generate the complete download.php HTML page matching exact twdown style from image
function renderDownloadPage({ videoData, error, requestedUrl }) {
  const pageTitle = videoData
    ? `${escapeHtml(videoData.title.slice(0, 50))} - Download Twitter Video`
    : "Download Twitter Videos in MP4 & MP3";

  let mainContentHtml = "";

  if (error) {
    mainContentHtml = `
      <div class="row">
        <div class="col-md-8 col-md-offset-2">
          <div class="alert alert-danger" role="alert" style="border-radius: 6px; margin-top: 15px; box-shadow: 0 2px 10px rgba(0,0,0,0.06); text-align: left;">
            <span class="glyphicon glyphicon-exclamation-sign" aria-hidden="true" style="margin-right: 6px;"></span>
            <strong>Error:</strong> ${escapeHtml(error)}
          </div>
          <div style="margin-top: 20px;">
            <form action="/download.php" method="post">
              <div class="input-group search-box-group">
                <input name="URL" class="form-control search-input" placeholder="Paste Twitter Video Link ..." type="url" value="${escapeHtml(requestedUrl || "")}" required autofocus>
                <span class="input-group-btn">
                  <button class="btn btn-primary search-btn" type="submit">
                    <span class="glyphicon glyphicon-arrow-down" aria-hidden="true" style="margin-right: 4px;"></span>Download
                  </button>
                </span>
              </div>
            </form>
          </div>
          <p style="margin-top: 20px;">
            <a href="index.html" class="btn btn-default"><span class="glyphicon glyphicon-arrow-left"></span> Back to Homepage</a>
          </p>
        </div>
      </div>
    `;
  } else if (videoData) {
    const tableRows = videoData.variants.map(v => {
      return `
        <tr>
          <td><a href="#" onclick="preview_video('${escapeHtml(v.url)}'); return false;" style="color: #2ecc71;"><span class="glyphicon glyphicon-play"></span></a></td>
          <th>${escapeHtml(String(v.bitrateKbps))}</th>
          <td>MP4</td>
          <td><a href="/api/stream?url=${encodeURIComponent(v.url)}&filename=${encodeURIComponent(v.filename)}" style="color: #16a085;"><strong>Download</strong></a></td>
        </tr>
      `;
    }).join("");

    const bestMp4 = videoData.variants[0] || {};
    const mp3Filename = `${getCleanFilename(videoData.title)}.mp3`;

    mainContentHtml = `
      <!-- Video Details Box (Exact Match to 2nd Image: Compact & Clean) -->
      <div class="row" style="margin-bottom: 22px;">
        <div class="col-md-8 col-md-offset-2" style="float: none; margin-left: auto; margin-right: auto; max-width: 580px;">
          <div class="video-preview-card" style="background: #ffffff; border-radius: 6px; box-shadow: 0 1px 6px rgba(0,0,0,0.08); border: 1px solid #e5e7eb; overflow: hidden; display: -webkit-box; display: -webkit-flex; display: -ms-flexbox; display: flex; flex-wrap: wrap; height: 165px;">
            
            <!-- Left: Thumbnail (Exact 48% Width, 165px Height) -->
            <div style="-webkit-box-flex: 0; -webkit-flex: 0 0 48%; -ms-flex: 0 0 48%; flex: 0 0 48%; width: 48%; height: 100%; background: #000; overflow: hidden; position: relative;">
              <img src="${escapeHtml(videoData.thumbnail)}" alt="Twitter Video Preview" style="width: 100%; height: 100%; object-fit: cover; display: block;">
            </div>

            <!-- Right: Content (Exact 52% Width, Matching 2nd Image Layout) -->
            <div style="-webkit-box-flex: 0; -webkit-flex: 0 0 52%; -ms-flex: 0 0 52%; flex: 0 0 52%; width: 52%; height: 100%; padding: 12px 16px; text-align: left; background: #ffffff; display: -webkit-box; display: -webkit-flex; display: -ms-flexbox; display: flex; flex-direction: column; justify-content: center; box-sizing: border-box;">
              
              <!-- Author / Account Name -->
              <div style="text-align: center; margin-bottom: 4px;">
                <h3 style="font-size: 17.5px; font-weight: 700; margin: 0 0 3px 0; color: #111827; line-height: 1.2;">${escapeHtml(videoData.authorName)}</h3>
                <div style="width: 32px; height: 2px; background: #cbd5e1; margin: 0 auto;"></div>
              </div>

              <!-- Description -->
              <div style="margin-top: 6px; margin-bottom: 4px;">
                <div style="font-size: 12.5px; font-weight: 700; color: #111827; margin-bottom: 2px;">Description:</div>
                <div style="font-size: 11.5px; line-height: 1.35; color: #4b5563; word-break: break-word; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${escapeHtml(videoData.title)}</div>
              </div>

              <!-- Duration -->
              <div style="font-size: 12px; color: #374151; margin-top: 3px;">
                <strong style="color: #111827;">Duration:</strong> ${escapeHtml(videoData.duration || "00:20")}
              </div>

            </div>

          </div>
        </div>
      </div>

      <!-- Qualities Table (Matching Image 3 Exactly) -->
      <div class="row">
        <div class="col-md-8 col-md-offset-2" style="float: none; margin-left: auto; margin-right: auto; max-width: 540px;">
          <table class="table table-bordered table-hover table-striped" style="width: 100%;-webkit-box-shadow: 0px 0px 32px -13px rgba(0,0,0,0.75);-moz-box-shadow: 0px 0px 32px -13px rgba(0,0,0,0.75);box-shadow: 0px 0px 32px -13px rgba(0,0,0,0.75); background: #ffffff; border-radius: 4px;">
            <thead>
              <tr class="active">
                <th><span class="glyphicon glyphicon-eye-open"></span></th>
                <th>Quality (Bitrate) <span class="glyphicon glyphicon-hd-video"></span></th>
                <th>File Type <span class="glyphicon glyphicon-play-circle"></span></th>
                <th>Downloads <span class="glyphicon glyphicon-download"></span></th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
              <tr>
                <td><span class="glyphicon glyphicon-music"></span></td>
                <th>Convert to MP3</th>
                <td>MP3</td>
                <td><a href="/api/mp3?url=${encodeURIComponent(bestMp4.url || '')}&filename=${encodeURIComponent(mp3Filename)}" style="color: #16a085;"><strong>Download</strong></a></td>
              </tr>				
            </tbody>
          </table>
        </div>
      </div>

      <!-- Modal -->
      <div class="modal fade" id="myModal" tabindex="-1" role="dialog" data-backdrop="static" aria-labelledby="myModalLabel">
        <div class="modal-dialog" role="document">
          <div class="modal-content">
            <div class="modal-header">
              <button type="button" onclick="destroy()" class="close" data-dismiss="modal" aria-label="Close"><span aria-hidden="true">&times;</span></button>
              <h4 class="modal-title" id="myModalLabel">Preview Video</h4>
            </div>
            <div class="modal-body">
              <div id="previewer" class="embed-responsive embed-responsive-16by9">
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-default" data-dismiss="modal" onclick="destroy()">Close</button>
            </div>
          </div>
        </div>
      </div>
      <script>
        function preview_video(x) {
          destroy();
          var video = $('<video />', {
            id: 'preview',
            src: x,
            type: 'video/mp4',
            controls: true,
            autoplay: true
          });
          video.appendTo($('#previewer'));
          $('#myModal').modal('show');
        }

        function destroy() {
          var p = document.getElementById('preview');
          if (p) {
            p.pause();
            p.src = '';
            p.remove();
          }
          $('#previewer').empty();
        }

        $('#myModal').on('hidden.bs.modal', function () {
          destroy();
        });
      </script>
    `;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <title>${pageTitle}</title>
  <meta name="description" content="Here you can download your favorite twitter videos in MP4 or convert them to MP3 all in 1 click and without using any software, java or extensions.">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta charset="utf-8">
  <link rel="shortcut icon" href="Logo/title.png">
  <link rel="icon" type="image/png" href="Logo/title.png">
  <link href="css/bootstrap.min.css" rel="stylesheet">
  <link href="css/style.css" rel="stylesheet">
  <script type="text/javascript" src="js/jquery.min.js"></script>
  <script type="text/javascript" src="js/bootstrap.min.js"></script>
  <script type="text/javascript" src="js/scripts.js"></script>
  <style>
    .card-horizontal {
      display: flex;
      flex: 1 1 auto;
    }
    .btn-download-another {
      background-color: #5c727d !important;
      color: #ffffff !important;
      font-weight: 700 !important;
      font-size: 13.5px !important;
      padding: 7px 16px !important;
      border-radius: 4px !important;
      border: none !important;
      text-decoration: none !important;
      display: inline-flex !important;
      align-items: center !important;
      gap: 7px !important;
      box-shadow: 0 1px 3px rgba(0,0,0,0.12) !important;
      transition: background-color 0.2s ease, transform 0.1s ease !important;
    }
    .btn-download-another:hover,
    .btn-download-another:focus,
    .btn-download-another:active {
      background-color: #4a5d67 !important;
      color: #ffffff !important;
      text-decoration: none !important;
      outline: none !important;
    }
    @media (max-width: 580px) {
      .video-preview-card {
        height: auto !important;
      }
      .video-preview-card > div {
        width: 100% !important;
        flex: 0 0 100% !important;
      }
      .video-preview-card > div:first-child {
        height: 150px !important;
      }
    }
  </style>
</head>
<body>
  <div class="navbar navbar-default navbar-static-top">
    <div class="container">
      <div class="navbar-header">
        <button type="button" class="navbar-toggle" data-toggle="collapse" data-target=".navbar-collapse">
          <span class="icon-bar"></span>
          <span class="icon-bar"></span>
          <span class="icon-bar"></span>
        </button>
        <a class="navbar-brand" href="index.html" title="Twitter Downloader Online"><img class="img-responsive" alt="Twitter Video Downloader Online" src="/Logo/main.png"></a>
      </div>
      <div class="collapse navbar-collapse">
        <ul class="nav navbar-nav">
          <li class="dropdown">
            <a href="#" class="dropdown-toggle" data-toggle="dropdown" role="button" aria-haspopup="true" aria-expanded="false"><span class="glyphicon glyphicon-question-sign"></span> How to? <span class="caret"></span></a>
            <ul class="dropdown-menu">
              <li><a href="how-to-download-twitter-videos.html">How to use XDock?</a></li>
            </ul>
          </li>
          <li class="dropdown">
            <a href="#" class="dropdown-toggle" data-toggle="dropdown" role="button" aria-haspopup="true" aria-expanded="false"><span class="glyphicon glyphicon-option-vertical"></span> More <span class="caret"></span></a>
            <ul class="dropdown-menu">
              <li><a href="https://fbdock.vercel.app/" target="_blank">Facebook Downloader</a></li>
            </ul>
          </li>
        </ul>
        <ul class="nav navbar-nav navbar-right">
          <li><a href="contact.html"><span class="glyphicon glyphicon-comment" aria-hidden="true"></span> Contact us</a></li>
        </ul>
      </div>
    </div>
  </div>

  <div class="jumbotron" style="padding-top: 20px;">
    <div class="container">
      <div style="text-align: left; margin-bottom: 6px;">
        <a href="index.html" class="btn btn-download-another">
          <span style="font-size: 15px; font-weight: bold; line-height: 1;">&larr;</span> Download Another Video
        </a>
      </div>
      <center>
        <a href="index.html" title="Twitter Video Downloader"><img class="img-responsive" alt="Twitter Video Downloader online" title="Twitter Video Downloader" src="/Logo/nev.png" width="280px"></a>
        <h1 style="font-size:19px;margin-top:-0%;font-weight:bold">Twitter Video Downloader</h1>
        <h2 style="font-size:16px;margin-top:-0.5%" class="text-muted">Download your Twitter video in MP4 or MP3</h2>
        <br />
        <div style="float:none;" class="col-lg-8"></div>
        <br />
        ${mainContentHtml}
        <br />
      </center>
    </div>
  </div>



  <div class="container footer-wrap">
    <div class="well col-md-12 text-center">
      <p style="margin-bottom: 2px;"><strong>Twitter Online Video Downloader</strong> | <a href="privacy.html">Privacy Policy</a></p>
      <p style="margin-bottom: 2px;">
        Our other service : <a href="https://fbdock.vercel.app/" target="_blank"><strong>Facebook Video Downloader</strong></a>
      </p>
      <p style="margin-bottom: 2px; font-size: 13px; color: #555;">
        <a href="terms.html">Terms of Use</a> | 
        <a href="contact.html">Contact us</a> | 
        <a href="about.html">About</a> | 
        <a href="disclaimer.html">Disclaimer</a>
      </p>
      <p style="margin-bottom: 0; font-size: 12.5px; color: #666;">
        XDock does not host any videos on its servers. All videos that you download are hosted on Twitter's CDNs.
      </p>
    </div>
  </div>
</body>
</html>`;
}

// Handler for /download.php and /download
async function handleDownloadRequest(req, res) {
  const rawUrl = (req.body?.URL || req.body?.url || req.query?.URL || req.query?.url || "").trim();

  if (!rawUrl) {
    return res.send(renderDownloadPage({
      error: "Please enter a valid Twitter/X video URL.",
      requestedUrl: ""
    }));
  }

  const tweetId = extractTweetId(rawUrl);
  if (!tweetId) {
    return res.send(renderDownloadPage({
      error: "Invalid Twitter/X video URL. Please make sure the link includes status ID (e.g. https://x.com/username/status/123456789).",
      requestedUrl: rawUrl
    }));
  }

  try {
    const videoData = await extractTwitterVideo(tweetId);
    return res.send(renderDownloadPage({
      videoData,
      requestedUrl: rawUrl
    }));
  } catch (err) {
    console.error(`[Download Request Error] tweetId=${tweetId}:`, err.message);
    return res.send(renderDownloadPage({
      error: err.message || "Unable to extract video from this Tweet.",
      requestedUrl: rawUrl
    }));
  }
}

app.post("/download.php", handleDownloadRequest);
app.get("/download.php", handleDownloadRequest);
app.post("/download", handleDownloadRequest);
app.get("/download", handleDownloadRequest);

// Streaming attachment endpoint
app.get("/api/stream", async (req, res) => {
  const targetUrl = typeof req.query.url === "string" ? req.query.url.trim() : "";
  const filename = typeof req.query.filename === "string" ? req.query.filename.trim() : "Twitter_Video.mp4";

  if (!targetUrl || !targetUrl.startsWith("http")) {
    return res.status(400).send("Invalid video URL.");
  }

  try {
    const streamResponse = await fetch(targetUrl);
    if (!streamResponse.ok) {
      return res.redirect(targetUrl);
    }

    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    const contentLength = streamResponse.headers.get("content-length");
    if (contentLength) {
      res.setHeader("Content-Length", contentLength);
    }

    Readable.fromWeb(streamResponse.body).pipe(res);
  } catch (err) {
    console.error("[Stream Error]:", err.message);
    res.redirect(targetUrl);
  }
});

// MP3 audio extraction and conversion endpoint
app.get(["/api/mp3", "/mp3.php"], (req, res) => {
  const targetUrl = typeof req.query.url === "string" ? req.query.url.trim() : (req.query.v ? req.query.v.trim() : "");
  let filename = typeof req.query.filename === "string" ? req.query.filename.trim() : "Twitter_Audio.mp3";
  if (!filename.toLowerCase().endsWith(".mp3")) {
    filename += ".mp3";
  }

  if (!targetUrl || !targetUrl.startsWith("http")) {
    return res.status(400).send("Invalid video URL for MP3 conversion.");
  }

  if (!isFfmpegAvailable) {
    return res.status(503).send("MP3 conversion is unavailable on this environment. Please download the MP4 video directly.");
  }

  try {
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    const command = ffmpeg(targetUrl)
      .noVideo()
      .audioCodec("libmp3lame")
      .audioBitrate(128)
      .format("mp3")
      .on("error", (err) => {
        console.error("[FFmpeg MP3 Error]:", err.message);
        if (!res.headersSent) {
          res.status(500).send("Failed to convert video to MP3.");
        }
      });

    command.pipe(res, { end: true });
  } catch (err) {
    console.error("[MP3 Error]:", err.message);
    if (!res.headersSent) {
      res.status(500).send("Error initiating MP3 conversion.");
    }
  }
});

// JSON API endpoint for backward compatibility or AJAX calls
app.get("/api/download", async (req, res) => {
  const rawUrl = typeof req.query.url === "string" ? req.query.url.trim() : "";
  const wantsJson = req.query.json === "true" || req.headers.accept?.includes("application/json");

  const tweetId = extractTweetId(rawUrl);
  if (!tweetId) {
    const errorMsg = "Please enter a valid Twitter/X video URL.";
    if (wantsJson) {
      return res.status(400).json({ success: false, error: errorMsg });
    }
    return res.status(400).send(errorMsg);
  }

  try {
    const videoData = await extractTwitterVideo(tweetId);
    if (wantsJson) {
      return res.json({
        success: true,
        id: videoData.id,
        title: videoData.title,
        author: videoData.author,
        thumbnail: videoData.thumbnail,
        hd: videoData.hdUrl,
        sd: videoData.sdUrl,
        variants: videoData.variants
      });
    }

    const selectedUrl = req.query.quality === "sd" ? videoData.sdUrl : videoData.hdUrl;
    const filename = `${getCleanFilename(videoData.title)}_${req.query.quality === "sd" ? "SD" : "HD"}.mp4`;
    res.redirect(`/api/stream?url=${encodeURIComponent(selectedUrl)}&filename=${encodeURIComponent(filename)}`);
  } catch (err) {
    console.error(`[Download Error] id=${tweetId}:`, err.message);
    const msg = err.message || "Unable to download video from this Tweet.";
    if (wantsJson) {
      return res.status(500).json({ success: false, error: msg });
    }
    res.status(500).send(msg);
  }
});

const CONTACT_EMAIL = "nimpataaaa@gmail.com";
const WEB3FORMS_ACCESS_KEY = "18000a90-d273-485a-b5b0-8ed2f3ba4ba5";

app.post("/api/contact", (req, res) => {
  const { name, email, subject, message, video_link, captchaAnswer, captchaExpected } = req.body || {};
  if (!name || !email || !message) {
    return res.status(400).json({ success: false, error: "Please fill in all required fields." });
  }
  if (parseInt(captchaAnswer, 10) !== parseInt(captchaExpected, 10)) {
    return res.status(400).json({ success: false, error: "Incorrect security answer." });
  }
  console.log(`[Contact Message Received] From: ${name} <${email}> | To: ${CONTACT_EMAIL} | Subject: ${subject || "No subject"} | Video Link: ${video_link || "N/A"}`);
  res.json({ success: true, message: "Message received successfully." });
});

app.use(express.static(__dirname));
app.use(express.static(publicRoot));
app.use("/Logo", express.static(path.join(__dirname, "Logo")));

// Safe routes for Vercel / serverless environments
app.get(["/", "/index.html"], (req, res) => {
  const rootIndex = path.join(__dirname, "index.html");
  if (fs.existsSync(rootIndex)) return res.sendFile(rootIndex);
  const pubIndex = path.join(publicRoot, "index.html");
  if (fs.existsSync(pubIndex)) return res.sendFile(pubIndex);
  res.send("Twitter Video Downloader");
});

app.get("/:page.html", (req, res, next) => {
  const rootFile = path.join(__dirname, `${req.params.page}.html`);
  if (fs.existsSync(rootFile)) return res.sendFile(rootFile);
  const pubFile = path.join(publicRoot, `${req.params.page}.html`);
  if (fs.existsSync(pubFile)) return res.sendFile(pubFile);
  next();
});

module.exports = app;

if (require.main === module || !process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`Twitter video downloader running at http://localhost:${port}`);
  });
}
