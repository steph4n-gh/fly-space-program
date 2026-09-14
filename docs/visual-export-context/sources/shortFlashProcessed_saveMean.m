% shortFlashProcessed_saveMean.m
%
% Script to load processed short flash data and to save just the mean
%  response for the light flash and the dark flash.
% Only for data format for L1/L2 paper.
% To send data to Shaul regarding request by email on 3/8/18.
% Updated to save individual responses as well as the mean.
%
% Updated: 3/14/18

% where to save new .mat files
saveDir = '/Users/hyang/Documents/New Imaging Analysis/AnalyzedData/ImpulseResponsesForShaul/';

% which stimulus flashes
pairedEpochs = [1 2];

fileDir = '/Users/hyang/Documents/New Imaging Analysis/AnalyzedData/CurrentAnalyzedData';
cd(fileDir)

% loop through every file in folder
fileList = dir('*.mat');

for i = 1:length(fileList)
    
    % get short flash data file
    fileName = fileList(i).name;
    
    % load data file - only roiDataMat and iResp variables needed
    load(fileName, 'roiDataMat', 'iResp');
    % short flash stimulus, responding cells only
    respROIMat = roiDataMat(iResp, 2);
    
    % preallocate
    numResp = size(pairedEpochs, 2); % total number impulse responses
    meanResp = zeros(numResp,length(respROIMat(1).rats{pairedEpochs(1)}));
        
    for j = 1:size(pairedEpochs, 2) % number of contrast values
        % preallocate
        rats = zeros(length(respROIMat),...
            length(respROIMat(1).rats{pairedEpochs(j)}));

        % get all individual ROI responses
        for n = 1:length(respROIMat)
            rats(n,:) = respROIMat(n).rats{pairedEpochs(j)};
        end 
        % mean response
        meanResp(j,:) = mean(rats,1);
        % individual responses
        indivResp{j} = rats;
    end
    
    % time
    t = respROIMat(1).t{1};
    
    % save data file
    save([saveDir fileName], 'meanResp','indivResp','t');
end
    