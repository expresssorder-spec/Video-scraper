import React, { useState, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI } from "@google/genai";

const App: React.FC = () => {
  const [apiKey, setApiKey] = useState<string>('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isVideoReady, setIsVideoReady] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [resultText, setResultText] = useState<string | null>(null);
  const [groundingChunks, setGroundingChunks] = useState<any[]>([]);

  const videoRef = useRef<HTMLVideoElement>(null);

  const extractFrameAsBase64 = (): Promise<string> => {
    return new Promise((resolve, reject) => {
      const video = videoRef.current;
      if (!video) {
        return reject("Video element not found.");
      }

      const canvas = document.createElement("canvas");
      
      const onSeeked = () => {
        try {
          video.removeEventListener('seeked', onSeeked);
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const context = canvas.getContext("2d");
          if (!context) {
            return reject("Could not get canvas context.");
          }
          context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
          const dataUrl = canvas.toDataURL("image/jpeg");
          resolve(dataUrl.split(",")[1]); // remove prefix
        } catch (e) {
          reject(`Failed to extract frame: ${e}`);
        }
      };
      
      video.addEventListener('seeked', onSeeked);
      video.currentTime = video.duration / 2; // Seek to the middle
    });
  };

  const handleFileChange = (file: File | null) => {
    if (file) {
      if (!file.type.startsWith("video/")) {
        setError("Please upload a valid video file.");
        return;
      }
      setError(null);
      setResultText(null);
      setGroundingChunks([]);
      setIsVideoReady(false);
      setVideoFile(file);
      const url = URL.createObjectURL(file);
      setVideoSrc(url);
    }
  };
  
  const handleDrop = useCallback((event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.currentTarget.classList.remove('drag-over');
    if (event.dataTransfer.files && event.dataTransfer.files[0]) {
      handleFileChange(event.dataTransfer.files[0]);
    }
  }, []);

  const handleDragOver = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.currentTarget.classList.add('drag-over');
  };

  const handleDragLeave = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.currentTarget.classList.remove('drag-over');
  };
  
  const handleAnalyzeClick = async () => {
    if (!videoFile) {
      setError("Please select a video file first.");
      return;
    }
    if (!apiKey) {
      setError("Please enter your Google Gemini API key to proceed.");
      return;
    }
    if (!isVideoReady) {
      setError("Please wait for the video to finish loading.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setResultText(null);
    setGroundingChunks([]);

    try {
      const base64Frame = await extractFrameAsBase64();
      
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: {
          parts: [
            {
              inlineData: {
                data: base64Frame,
                mimeType: "image/jpeg",
              },
            },
            {
              text: "Analyze this video frame and find the original video or information about it on the web.",
            },
          ],
        },
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      setResultText(response.text);
      setGroundingChunks(response.candidates?.[0]?.groundingMetadata?.groundingChunks || []);

    } catch (e: any) {
      if (e.message?.includes('API key not valid')) {
        setError('The provided API key is not valid. Please check your key and try again.');
      } else {
        setError(`An error occurred during analysis: ${e.message}`);
      }
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const getButtonText = () => {
    if (isLoading) return "Analyzing...";
    if (videoFile && !isVideoReady) return "Loading video...";
    return "Analyze Video";
  }

  return (
    <div className="app-container">
      <h1 className="title">Video Origin Finder</h1>
      
      <div className="api-key-container">
        <label htmlFor="api-key-input">Google Gemini API Key</label>
        <input
          id="api-key-input"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Enter your API key here"
          aria-label="Google Gemini API Key"
        />
      </div>

      <label 
        className="upload-zone"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <input
          type="file"
          accept="video/*"
          onChange={(e) => handleFileChange(e.target.files ? e.target.files[0] : null)}
        />
        <div className="upload-icon">🎬</div>
        <p className="upload-text">
          {videoFile ? videoFile.name : 'Drop a video file here or click to select'}
        </p>
      </label>

      {videoSrc && (
        <div className="preview-container">
          <video 
            ref={videoRef} 
            src={videoSrc} 
            controls 
            playsInline 
            onLoadedData={() => setIsVideoReady(true)}
          />
        </div>
      )}

      <button
        className="analyze-button"
        onClick={handleAnalyzeClick}
        disabled={!videoFile || !apiKey || isLoading || !isVideoReady}
      >
        {getButtonText()}
      </button>

      {isLoading && (
        <div className="loader-container">
          <div className="loader"></div>
          <span>Analyzing... This may take a moment.</span>
        </div>
      )}

      {error && <div className="error-message">{error}</div>}

      {resultText && (
        <div className="results-container">
          <h2>Analysis</h2>
          <p>{resultText}</p>
          {groundingChunks.length > 0 && (
            <div>
              <h2>Sources</h2>
              <ul className="sources-list">
                {groundingChunks.map((chunk, index) => (
                    chunk.web && (
                        <li key={index}>
                            <a href={chunk.web.uri} target="_blank" rel="noopener noreferrer">
                                {chunk.web.title || chunk.web.uri}
                            </a>
                        </li>
                    )
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<React.StrictMode><App /></React.StrictMode>);