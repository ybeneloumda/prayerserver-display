# Prayerserver Display

&#x20;&#x20;

A real-time prayer time display application built with Node.js and HTML. This project fetches prayer times from an API and displays them on a clean, responsive web interface.

---

## Features

- Real-time prayer time updates
- Responsive front-end interface
- Built with Node.js and HTML
- Easy to customize and extend

---

## Prerequisites

Make sure you have the following installed:

- [Node.js](https://nodejs.org/) (v14 or higher)
- [npm](https://www.npmjs.com/) (Node Package Manager)

---

## Installation

1. **Clone the repository**

```bash
git clone https://github.com/ybeneloumda/prayerserver-display.git
cd prayerserver-display
```

2. **Install dependencies**

```bash
npm install
```

3. **Run the application**

```bash
npm start
```

### Full Raspberry Pi setup (from scratch)
These steps assume Raspberry Pi OS (Debian-based) and a fresh device.

1) **Update the system**

```bash
sudo apt update && sudo apt upgrade -y
```

2) **Install Node.js and Nginx**

```bash
sudo apt install -y nodejs npm nginx git
```

3) **Clone the app**

```bash
git clone https://github.com/ybeneloumda/prayerserver-display.git
cd prayerserver-display
```

4) **Install dependencies**

```bash
npm install
```

5) **Copy the systemd service and enable it**

```bash
sudo cp deploy/prayerserver.service /etc/systemd/system/prayerserver.service
sudo systemctl daemon-reload
sudo systemctl enable prayerserver
sudo systemctl start prayerserver
```

6) **Configure Nginx reverse proxy**

```bash
sudo cp deploy/nginx-prayerserver.conf /etc/nginx/sites-available/prayerserver
sudo ln -s /etc/nginx/sites-available/prayerserver /etc/nginx/sites-enabled/prayerserver
sudo nginx -t
sudo systemctl reload nginx
```

7) **Open the app**

```
http://<raspberry-pi-ip>
```

### Raspberry Pi (recommended)
Use port 3000 with Nginx on port 80 and a systemd service.

1) **Copy the systemd service and enable it**

```bash
sudo cp deploy/prayerserver.service /etc/systemd/system/prayerserver.service
sudo systemctl daemon-reload
sudo systemctl enable prayerserver
sudo systemctl start prayerserver
```

2) **Configure Nginx reverse proxy**

```bash
sudo cp deploy/nginx-prayerserver.conf /etc/nginx/sites-available/prayerserver
sudo ln -s /etc/nginx/sites-available/prayerserver /etc/nginx/sites-enabled/prayerserver
sudo nginx -t
sudo systemctl reload nginx
```

3) **Optional: set port via environment**

```bash
cp .env.example .env
```

4. **Access the app**

Open your browser and go to :

```
http://hostname:port
```

---

## File Structure

```
prayerserver-display/
├── server.js          # Main server file
├── prayer_app.html    # Front-end interface
├── public/            # Static assets (CSS, JS)
├── package.json       # Project metadata and dependencies
└── package-lock.json  # Locks dependency versions
```

---

## Customization

- **Server**: Edit `server.js` to modify API endpoints or server behavior.
- **Front-end**: Update `prayer_app.html` to change the display layout.
- **Assets**: CSS and JS files are in the `public/` directory.

---

## Contributing

Contributions are welcome! Follow these steps:

1. Fork the repository
2. Create a feature branch

```bash
git checkout -b feature-name
```

3. Commit your changes

```bash
git commit -m "Add feature"
```

4. Push to the branch

```bash
git push origin feature-name
```

5. Open a Pull Request

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

## Screenshots

&#x20;

