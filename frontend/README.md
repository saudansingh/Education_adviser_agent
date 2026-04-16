# Voice Agent Frontend - Ankur Education Advisor

A modern React frontend for interacting with voice agents, featuring a sleek sidebar interface and real-time voice communication capabilities.

## Features

- **Modern UI Design**: Beautiful gradient backgrounds with Tailwind CSS
- **Agent Sidebar**: List of available agents with status indicators
- **Voice Chat Interface**: Real-time voice communication with agents
- **Audio Visualization**: Dynamic audio bars showing agent speaking status
- **Connection Management**: Easy connect/disconnect functionality
- **Text Chat Backup**: Type messages when voice isn't available
- **Responsive Design**: Works on desktop and mobile devices

## Agents Available

1. **Ankur - Education Advisor** (Available)
   - Specialized in learning strategies and career guidance
   - Your main education consultant

2. **Math Tutor** (Available)
   - Advanced mathematics problem solving
   - STEM education support

3. **Science Coach** (Busy)
   - Physics, Chemistry, and Biology guidance
   - Currently unavailable

## Quick Start

### Prerequisites

- Node.js 16+ installed
- Your voice agent running in dev mode
- LiveKit Cloud account (already configured)

### Installation

1. **Navigate to frontend directory:**
   ```bash
   cd frontend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npm start
   ```

4. **Open your browser:**
   Navigate to `http://localhost:3000`

### Usage

1. **Select an Agent**: Click on "Ankur - Education Advisor" in the sidebar
2. **Connect**: Click the "Connect" button to establish voice connection
3. **Start Talking**: Use voice or text to communicate with the agent
4. **Control Audio**: Use mute/unmute button for microphone control
5. **Disconnect**: Click "Disconnect" when finished

## Technical Details

### Architecture

- **Frontend**: React 18 with modern hooks
- **Styling**: Tailwind CSS with custom animations
- **Voice Integration**: LiveKit Components React
- **Icons**: Lucide React for modern icons
- **Audio Processing**: Web Audio API integration

### Key Components

- **App.js**: Main application component with agent selection and chat interface
- **LiveKitIntegration.js**: LiveKit room connection and management
- **Tailwind Config**: Custom color scheme and animations

### LiveKit Integration

The app connects to your LiveKit server using:
- **Server URL**: `wss://voice-agent-u5bk8av6.livekit.cloud`
- **Authentication**: Token-based authentication
- **Features**: Audio capture, voice activity detection

## Configuration

### Environment Variables

The app is pre-configured with your LiveKit credentials. For production, consider:

1. **Environment Variables**: Move sensitive data to `.env` file
2. **Token Server**: Implement server-side token generation
3. **CORS Settings**: Configure proper CORS for production

### Customization

#### Adding New Agents

Edit `agents` array in `App.js`:

```javascript
{
  id: 'new-agent',
  name: 'Agent Name',
  title: 'Agent Title',
  description: 'Agent description',
  icon: IconComponent,
  color: 'bg-color-class',
  status: 'available' // or 'busy', 'offline'
}
```

#### Custom Colors

Update `tailwind.config.js` to add new color schemes:

```javascript
colors: {
  primary: { /* your colors */ },
  secondary: { /* your colors */ }
}
```

## Troubleshooting

### Common Issues

1. **Connection Failed**:
   - Ensure your voice agent is running in dev mode
   - Check LiveKit server URL is correct
   - Verify API keys are valid

2. **Audio Not Working**:
   - Allow microphone permissions in browser
   - Check microphone is not muted in system settings
   - Try refreshing the page

3. **Agent Not Responding**:
   - Check agent console for errors
   - Verify agent is running properly
   - Check network connection

### Debug Mode

Enable console logging by opening browser developer tools (F12) and checking the Console tab.

## Development

### Project Structure

```
frontend/
src/
  App.js              # Main application component
  App.css             # Custom styles
  index.js            # React entry point
  index.css           # Global styles with Tailwind
  LiveKitIntegration.js # LiveKit components
public/
  index.html          # HTML template
package.json          # Dependencies and scripts
tailwind.config.js    # Tailwind configuration
README.md             # This file
```

### Available Scripts

- `npm start` - Start development server
- `npm run build` - Build for production
- `npm test` - Run tests
- `npm run eject` - Eject from Create React App

## Production Deployment

### Build for Production

```bash
npm run build
```

This creates an optimized `build` folder ready for deployment.

### Deployment Options

1. **Static Hosting**: Deploy to Netlify, Vercel, or GitHub Pages
2. **Server**: Use Nginx or Apache to serve static files
3. **CDN**: Upload to AWS S3 with CloudFront

### Security Considerations

- Move API keys to environment variables
- Implement proper token generation
- Use HTTPS in production
- Add rate limiting for API calls

## Support

For issues with:
- **Voice Agent**: Check the agent console logs
- **LiveKit Connection**: Verify server status and credentials
- **Frontend**: Check browser console for errors

## License

This project is part of the Voice Agent Workshop. Feel free to modify and use for your educational purposes.

---

**Happy Learning with Ankur!** 
Your AI Education Advisor is ready to help you achieve your educational goals.
