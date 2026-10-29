/**
 * DataContext.jsx
 * Global state that holds the real parsed + diagnosed dataset.
 * Pages read from this context; UploadPage writes into it after parsing.
 */
import { createContext, useContext, useState } from 'react';

const DataContext = createContext(null);

export function DataProvider({ children }) {
  // Raw parsed file data
  const [fileInfo,   setFileInfo]   = useState(null); // { name, ext, size, rowCount, columns, sheetName }

  // Diagnosed results from the most recently uploaded dataset
  const [devices,    setDevices]    = useState(null);
  const [summary,    setSummary]    = useState(null);

  const clearData = () => {
    setFileInfo(null);
    setDevices(null);
    setSummary(null);
  };

  return (
    <DataContext.Provider value={{
      fileInfo, setFileInfo,
      devices,  setDevices,
      summary,  setSummary,
      clearData,
      hasRealData: devices !== null,
    }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside <DataProvider>');
  return ctx;
}
