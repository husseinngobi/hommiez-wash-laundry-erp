# Hommiez Wash Laundry and Dry Cleaners Frontend

    React + TypeScript frontend for the Hommiez Wash Laundry and Dry Cleaners ERP system.

    ## 🚀 Tech Stack

    - **React 18** - UI framework
    - **TypeScript** - Type safety
    - **Vite** - Build tool
    - **shadcn/ui** - UI components
    - **Tailwind CSS** - Styling
    - **TanStack Query** - Data fetching
    - **React Router** - Navigation
    - **Lucide React** - Icons

    ## 📦 Installation

    ```bash
    npm install
    ```

    ## 🔧 Configuration

    The frontend expects the backend API to be running on `http://localhost:5000`.

    To change this, update the API base URL in your API service configuration (coming soon).

    ## 🏃 Development

    Start the development server:
    ```bash
    npm run dev
    ```

    Server runs on http://localhost:5173

    ## 🏗️ Build

    Build for production:
    ```bash
    npm run build
    ```

    Preview production build:
    ```bash
    npm run preview
    ```

    ## 📁 Project Structure

    ```
    frontend/
    ├── src/
    │   ├── App.tsx                 # Main app component
    │   ├── main.tsx                # Entry point
    │   ├── pages/                  # Page components
    │   │   ├── Dashboard.tsx       # Dashboard with stats
    │   │   ├── Orders.tsx          # Order list & management
    │   │   ├── NewOrder.tsx        # Create new order
    │   │   ├── Customers.tsx       # Customer management
    │   │   ├── PriceList.tsx       # Service pricing
    │   │   ├── Inventory.tsx       # Inventory tracking
    │   │   ├── Deliveries.tsx      # Delivery management
    │   │   ├── Reports.tsx         # Analytics & charts
    │   │   ├── Settings.tsx        # Settings
    │   │   └── Help.tsx            # Help & support
    │   ├── components/
    │   │   ├── layout/             # Layout components
    │   │   │   ├── MainLayout.tsx
    │   │   │   └── Sidebar.tsx
    │   │   ├── dashboard/          # Dashboard widgets
    │   │   ├── orders/             # Order components
    │   │   └── ui/                 # shadcn/ui components
    │   ├── data/
    │   │   └── priceData.ts        # Price data (to be replaced with API)
    │   ├── hooks/                  # Custom React hooks
    │   ├── lib/                    # Utilities
    │   └── assets/                 # Static assets
    ├── public/                     # Public assets
    ├── index.html                  # HTML entry point
    ├── vite.config.ts             # Vite configuration
    ├── tailwind.config.ts         # Tailwind configuration
    ├── tsconfig.json              # TypeScript configuration
    └── package.json               # Dependencies
    ```

    ## 🎨 Features

    - ✅ Modern, responsive UI
    - ✅ Dark/Light theme support
    - ✅ Dashboard with real-time stats
    - ✅ Order management system
    - ✅ Customer database
    - ✅ Service price catalog
    - ✅ Inventory tracking
    - ✅ Reports & analytics
    - 🔄 Backend API integration (in progress)

    ## 🔄 Next Steps

    ### API Integration
    1. Create API service layer (`src/services/api.ts`)
    2. Implement authentication context
    3. Replace mock data with API calls
    4. Add loading states
    5. Implement error handling

    ## 📝 Scripts

    - `npm run dev` - Start development server
    - `npm run build` - Build for production
    - `npm run preview` - Preview production build
    - `npm run lint` - Lint code

    ## 🔗 Related

    - **Backend API**: `../backend/`
    - **API Documentation**: `../backend/API_EXAMPLES.md`
    - **Setup Guide**: `../SETUP_GUIDE.md`

    ## 📚 Documentation

    See main project README for complete documentation.
