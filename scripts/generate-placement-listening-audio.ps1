param(
  [string]$OutputDirectory = (Join-Path $PSScriptRoot "..\apps\web\public\media\audio"),
  [string]$WslDistribution = "Ubuntu-26.04"
)

$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$ffmpeg = Get-Command ffmpeg -ErrorAction Stop
$wsl = "C:\Program Files\WSL\wsl.exe"
if (-not (Test-Path -LiteralPath $wsl)) { throw "WSL is required to generate the neural listening assets." }
$bootstrap = "rm -rf /tmp/e4s-edge-tts /tmp/e4s-get-pip.py; mkdir -p /tmp/e4s-edge-tts; curl -fsSL https://bootstrap.pypa.io/get-pip.py -o /tmp/e4s-get-pip.py; python3 /tmp/e4s-get-pip.py --target /tmp/e4s-edge-tts --quiet; PYTHONPATH=/tmp/e4s-edge-tts python3 -m pip install --target /tmp/e4s-edge-tts --quiet edge-tts"
& $wsl -d $WslDistribution -- bash -lc $bootstrap
if ($LASTEXITCODE -ne 0) { throw "Could not prepare the official edge-tts generator in WSL." }

$dialogues = @(
  @{
    File = "placement-listening-LA.wav"
    Rate = "-8%"
    Lines = @(
      @{ Voice = "en-GB-SoniaNeural"; Text = "Good morning, everyone. Just a quick reminder about tomorrow's team meeting. It will start at 9:30, not 9:00 as originally planned. We'll meet in Room 210. Please bring the latest sales report because we'll discuss our results from last month." },
      @{ Voice = "en-GB-RyanNeural"; Text = "Why has the time changed?" },
      @{ Voice = "en-GB-SoniaNeural"; Text = "The client has asked us to move our morning call, so we needed to change the meeting time." }
    )
  },
  @{
    File = "placement-listening-LB.wav"
    Rate = "-8%"
    Lines = @(
      @{ Voice = "en-GB-SoniaNeural"; Text = "Hi, James. Do you have a minute? I'm working on the customer report, but I'm not sure how to handle one part of it." },
      @{ Voice = "en-GB-RyanNeural"; Text = "Sure. What's the problem?" },
      @{ Voice = "en-GB-SoniaNeural"; Text = "The customer is asking for a refund, but the situation is a little unusual. I'm not sure which procedure applies." },
      @{ Voice = "en-GB-RyanNeural"; Text = "Have you checked the previous customer cases?" },
      @{ Voice = "en-GB-SoniaNeural"; Text = "No, not yet." },
      @{ Voice = "en-GB-RyanNeural"; Text = "I'd start there. We had a very similar case last month, and the report might show you which procedure we followed." },
      @{ Voice = "en-GB-SoniaNeural"; Text = "Okay. I'll check those records first." },
      @{ Voice = "en-GB-RyanNeural"; Text = "Good. If you still can't find the answer, come back to me. If you have any questions about the report, please speak to Sarah before we send it. We have to send the report today, but there may be some flexibility with the exact time." },
      @{ Voice = "en-GB-SoniaNeural"; Text = "That's helpful. Thanks." }
    )
  },
  @{
    File = "placement-listening-LC.wav"
    Rate = "-20%"
    Lines = @(
      @{ Voice = "en-GB-SoniaNeural"; Text = "So, what do you think about the new hybrid-work policy?" },
      @{ Voice = "en-GB-RyanNeural"; Text = "I think there are some advantages. People can probably concentrate better when they're working on tasks that require a lot of individual focus. But I'm concerned about communication." },
      @{ Voice = "en-GB-SoniaNeural"; Text = "What do you mean?" },
      @{ Voice = "en-GB-RyanNeural"; Text = "When people aren't in the office, they may not hear about decisions that are made informally. Someone might have an important conversation in a meeting, for example, but another team member working remotely doesn't know about it." },
      @{ Voice = "en-GB-SoniaNeural"; Text = "That's true. But I don't think that means the policy can't work. We probably need clearer communication procedures." },
      @{ Voice = "en-GB-RyanNeural"; Text = "Such as?" },
      @{ Voice = "en-GB-SoniaNeural"; Text = "Important decisions could be documented in one shared system instead of relying on conversations or messages between individual employees." },
      @{ Voice = "en-GB-RyanNeural"; Text = "Yes. That could make the system more reliable." }
    )
  }
)

$tempDirectory = Join-Path ([IO.Path]::GetTempPath()) ("e4s-listening-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tempDirectory | Out-Null
try {
  $pausePath = Join-Path $tempDirectory "pause.wav"
  & $ffmpeg.Source -hide_banner -loglevel error -y -f lavfi -i "anullsrc=r=48000:cl=mono" -t 0.12 -ac 1 -c:a pcm_s16le $pausePath
  if ($LASTEXITCODE -ne 0) { throw "ffmpeg failed while creating the dialogue pause." }

  foreach ($dialogue in $dialogues) {
    $concatEntries = [Collections.Generic.List[string]]::new()
    for ($index = 0; $index -lt $dialogue.Lines.Count; $index += 1) {
      $line = $dialogue.Lines[$index]
      $rawSegmentPath = Join-Path $tempDirectory ("{0}-{1}.mp3" -f [IO.Path]::GetFileNameWithoutExtension($dialogue.File), $index)
      $segmentPath = Join-Path $tempDirectory ("{0}-{1}.wav" -f [IO.Path]::GetFileNameWithoutExtension($dialogue.File), $index)
      $linuxSegmentPath = (& $wsl -d $WslDistribution -- wslpath -a $rawSegmentPath).Trim()
      & $wsl -d $WslDistribution -- env "PYTHONPATH=/tmp/e4s-edge-tts" python3 -m edge_tts --text $line.Text --write-media $linuxSegmentPath --voice $line.Voice --rate=$($dialogue.Rate) --volume=+0%
      if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $rawSegmentPath)) { throw "Neural TTS failed for $($dialogue.File), line $($index + 1)." }
      $trimFilter = "silenceremove=start_periods=1:start_duration=0.04:start_threshold=-45dB:start_silence=0.03,areverse,silenceremove=start_periods=1:start_duration=0.04:start_threshold=-45dB:start_silence=0.03,areverse,aresample=48000"
      & $ffmpeg.Source -hide_banner -loglevel error -y -i $rawSegmentPath -af $trimFilter -ac 1 -c:a pcm_s16le $segmentPath
      if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $segmentPath)) { throw "ffmpeg failed while trimming $($dialogue.File), line $($index + 1)." }
      $concatEntries.Add("file '$($segmentPath.Replace("'", "''"))'")
      if ($index -lt $dialogue.Lines.Count - 1) { $concatEntries.Add("file '$($pausePath.Replace("'", "''"))'") }
    }
    $concatPath = Join-Path $tempDirectory ("{0}.txt" -f [IO.Path]::GetFileNameWithoutExtension($dialogue.File))
    [IO.File]::WriteAllLines($concatPath, $concatEntries)
    $path = Join-Path $OutputDirectory $dialogue.File
    # Edge voices intentionally pause at punctuation; at slower CEFR rates those
    # pauses can exceed a second and make one dialogue sound like stitched clips.
    # Preserve a short natural breath while shortening only clearly silent spans.
    $dialogueFilter = "silenceremove=stop_periods=-1:stop_duration=0.15:stop_threshold=-45dB:stop_silence=0.06,loudnorm=I=-15:TP=-1.0:LRA=11,aresample=48000"
    & $ffmpeg.Source -hide_banner -loglevel error -y -f concat -safe 0 -i $concatPath -af $dialogueFilter -ac 1 -c:a pcm_s16le $path
    if ($LASTEXITCODE -ne 0) { throw "ffmpeg failed while assembling $($dialogue.File)" }
  }
} finally {
  Remove-Item -LiteralPath $tempDirectory -Recurse -Force -ErrorAction SilentlyContinue
}

function Write-ExamWarningTone([string]$Path) {
  $sampleRate = 44100
  $segments = @(
    @{ Duration = 0.14; Frequency = 880.0 },
    @{ Duration = 0.10; Frequency = 0.0 },
    @{ Duration = 0.14; Frequency = 1046.5 },
    @{ Duration = 0.08; Frequency = 0.0 }
  )
  $samples = [System.Collections.Generic.List[Int16]]::new()
  foreach ($segment in $segments) {
    $count = [int]($segment.Duration * $sampleRate)
    for ($index = 0; $index -lt $count; $index += 1) {
      if ($segment.Frequency -eq 0) { $samples.Add(0); continue }
      $edge = [math]::Min(1.0, [math]::Min($index / 220.0, ($count - $index - 1) / 220.0))
      $value = [math]::Sin(2 * [math]::PI * $segment.Frequency * $index / $sampleRate) * 18000 * $edge
      $samples.Add([int16]$value)
    }
  }
  $stream = [System.IO.File]::Create($Path)
  $writer = [System.IO.BinaryWriter]::new($stream)
  try {
    $dataSize = $samples.Count * 2
    $writer.Write([Text.Encoding]::ASCII.GetBytes("RIFF")); $writer.Write(36 + $dataSize)
    $writer.Write([Text.Encoding]::ASCII.GetBytes("WAVEfmt ")); $writer.Write(16); $writer.Write([int16]1); $writer.Write([int16]1)
    $writer.Write($sampleRate); $writer.Write($sampleRate * 2); $writer.Write([int16]2); $writer.Write([int16]16)
    $writer.Write([Text.Encoding]::ASCII.GetBytes("data")); $writer.Write($dataSize)
    foreach ($sample in $samples) { $writer.Write($sample) }
  } finally {
    $writer.Dispose(); $stream.Dispose()
  }
}

Write-ExamWarningTone (Join-Path $OutputDirectory "exam-warning.wav")
